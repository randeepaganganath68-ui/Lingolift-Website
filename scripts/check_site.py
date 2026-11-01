#!/usr/bin/env python3
"""Check local HTML structure, navigation targets, and referenced resources."""

from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path
import re
import sys
from urllib.parse import unquote, urljoin, urlsplit


ROOT = Path(__file__).resolve().parents[1]
VOID_ELEMENTS = {
    "area", "base", "br", "col", "embed", "hr", "img", "input",
    "link", "meta", "param", "source", "track", "wbr",
}
ALLOWED_EXTERNAL_HOSTS = {
    "cdn.jsdelivr.net",
    "fonts.googleapis.com",
    "fonts.gstatic.com",
    "lingolift.example",
    "zpujapkfegodxxdicwxa.supabase.co",
}
ALLOWED_EXTERNAL_MODULE_HOSTS = {"cdn.jsdelivr.net"}


class PageParser(HTMLParser):
    def __init__(self, path: Path) -> None:
        super().__init__(convert_charrefs=True)
        self.path = path
        self.stack: list[str] = []
        self.errors: list[str] = []
        self.ids: set[str] = set()
        self.local_references: list[tuple[str, str]] = []
        self.external_hosts: set[str] = set()
        self.title_count = 0
        self.title_text = ""
        self.description_count = 0
        self.h1_count = 0
        self.html_count = 0
        self.head_count = 0
        self.body_count = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = dict(attrs)
        if tag == "html":
            self.html_count += 1
            if not attributes.get("lang"):
                self.errors.append("html element is missing its lang attribute")
        elif tag == "head":
            self.head_count += 1
        elif tag == "body":
            self.body_count += 1
        elif tag == "title":
            self.title_count += 1
        elif tag == "meta" and attributes.get("name", "").lower() == "description":
            if attributes.get("content", "").strip():
                self.description_count += 1
            else:
                self.errors.append("meta description is empty")
        elif tag == "h1":
            self.h1_count += 1

        element_id = attributes.get("id")
        if element_id:
            if element_id in self.ids:
                self.errors.append(f"duplicate id: {element_id}")
            self.ids.add(element_id)

        if any(name.lower().startswith("on") for name, _ in attrs):
            self.errors.append(f"inline event handler found on <{tag}>")

        if tag == "iframe":
            self.errors.append("unexpected iframe found")

        for attribute in ("href", "src", "action", "poster"):
            value = attributes.get(attribute)
            if not value:
                continue
            parsed = urlsplit(value)
            if parsed.scheme in {"http", "https"} or parsed.netloc:
                host = (parsed.hostname or "").lower()
                self.external_hosts.add(host)
                if host not in ALLOWED_EXTERNAL_HOSTS:
                    self.errors.append(f"unapproved external resource host: {host or '(missing host)'}")
            elif parsed.scheme in {"mailto", "tel", "data"}:
                if parsed.scheme == "data":
                    self.errors.append(f"data URL found in {attribute}")
            elif not parsed.scheme:
                self.local_references.append((attribute, value))

        if tag == "a" and attributes.get("target", "").lower() == "_blank":
            rel = set(attributes.get("rel", "").lower().split())
            if not {"noopener", "noreferrer"}.issubset(rel):
                self.errors.append("target=_blank link is missing rel=noopener noreferrer")

        if tag not in VOID_ELEMENTS:
            self.stack.append(tag)

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag not in VOID_ELEMENTS:
            self.handle_starttag(tag, attrs)
            self.handle_endtag(tag)
        else:
            self.handle_starttag(tag, attrs)

    def handle_endtag(self, tag: str) -> None:
        if tag in VOID_ELEMENTS:
            self.errors.append(f"void element has a closing tag: </{tag}>")
        elif not self.stack:
            self.errors.append(f"unexpected closing tag: </{tag}>")
        elif self.stack[-1] != tag:
            self.errors.append(
                f"mismatched closing tag </{tag}>; expected </{self.stack[-1]}>"
            )
        else:
            self.stack.pop()

    def handle_data(self, data: str) -> None:
        if self.stack and self.stack[-1] == "title":
            self.title_text += data

    def finish(self) -> None:
        self.close()
        if self.stack:
            self.errors.append(f"unclosed element: <{self.stack[-1]}>")
        for label, count in (
            ("html", self.html_count),
            ("head", self.head_count),
            ("body", self.body_count),
            ("title", self.title_count),
        ):
            if count != 1:
                self.errors.append(f"expected exactly one {label} element; found {count}")
        if not self.title_text.strip():
            self.errors.append("title element is empty")
        if self.description_count != 1:
            self.errors.append(
                f"expected one non-empty meta description; found {self.description_count}"
            )
        if self.h1_count != 1:
            self.errors.append(f"expected one h1 element; found {self.h1_count}")


def referenced_file(page: Path, value: str) -> tuple[Path | None, str | None]:
    parsed = urlsplit(value)
    if parsed.scheme or parsed.netloc:
        return None, None

    path_text = unquote(parsed.path)
    if not parsed.path:
        target = page
    elif path_text.startswith("/"):
        target = (ROOT / path_text.lstrip("/")).resolve()
    else:
        target = (page.parent / path_text).resolve()

    try:
        target.relative_to(ROOT)
    except ValueError:
        return None, "reference escapes the project root"

    if target.is_dir():
        target /= "index.html"
    return target, unquote(parsed.fragment) or None


def check_external_module_imports() -> tuple[list[str], set[str]]:
    errors: list[str] = []
    hosts: set[str] = set()
    import_pattern = re.compile(
        r"""(?:\bfrom\s*|\bimport\s*)["'](https?://[^"']+)["']"""
    )

    for script in ROOT.rglob("*.js"):
        try:
            source = script.read_text(encoding="utf-8")
        except (OSError, UnicodeError) as error:
            errors.append(f"{script.relative_to(ROOT)}: could not read JavaScript ({error})")
            continue

        for module_url in import_pattern.findall(source):
            host = (urlsplit(module_url).hostname or "").lower()
            hosts.add(host)
            if host not in ALLOWED_EXTERNAL_MODULE_HOSTS:
                errors.append(
                    f"{script.relative_to(ROOT)}: unapproved external module host: "
                    f"{host or '(missing host)'}"
                )

    return errors, hosts


def main() -> int:
    pages = sorted(ROOT.rglob("*.html"))
    errors: list[str] = []
    parsers: dict[Path, PageParser] = {}
    resolved_links: list[tuple[Path, Path, str | None, str]] = []
    module_errors, module_hosts = check_external_module_imports()
    errors.extend(module_errors)

    for page in pages:
        parser = PageParser(page)
        try:
            parser.feed(page.read_text(encoding="utf-8"))
            parser.finish()
        except (OSError, UnicodeError) as error:
            errors.append(f"{page.relative_to(ROOT)}: could not read HTML ({error})")
            continue
        parsers[page] = parser
        for error in parser.errors:
            errors.append(f"{page.relative_to(ROOT)}: {error}")
        for attribute, value in parser.local_references:
            target, fragment = referenced_file(page, value)
            if target is None:
                if fragment:
                    if fragment not in parser.ids:
                        errors.append(
                            f"{page.relative_to(ROOT)}: missing fragment #{fragment}"
                        )
                continue
            if not target.is_file():
                errors.append(
                    f"{page.relative_to(ROOT)}: missing {attribute} target {value}"
                )
            elif attribute == "href":
                resolved_links.append((page, target, fragment, value))

    for source, target, fragment, value in resolved_links:
        if fragment:
            target_parser = parsers.get(target)
            if target_parser and fragment not in target_parser.ids:
                errors.append(
                    f"{source.relative_to(ROOT)}: target {value} has no #{fragment} id"
                )

    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        print(f"Site checks failed: {len(errors)} issue(s) across {len(pages)} HTML page(s).")
        return 1

    hosts = sorted(
        {host for parser in parsers.values() for host in parser.external_hosts}
        | module_hosts
    )
    print(
        f"Site checks passed: {len(pages)} HTML pages, "
        f"{len(resolved_links)} local navigation links, local resources and fragments."
    )
    print(f"Approved external resource hosts: {', '.join(hosts) if hosts else 'none'}")
    print("Note: standard-library structural checks are not a full HTML5 conformance validator.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
