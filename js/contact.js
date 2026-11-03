"use strict";

const contactForm = document.querySelector("#contact-form");

if (contactForm instanceof HTMLFormElement) {
  const fields = [
    { name: "name", errorId: "name-error", label: "a name between 2 and 80 characters", validate: (value) => value.trim().length >= 2 && value.trim().length <= 80 },
    { name: "email", errorId: "email-error", label: "a valid email address of no more than 254 characters", validate: (value) => value.trim().length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) },
    { name: "subject", errorId: "subject-error", label: "a topic", validate: (value) => ["question", "feedback", "other"].includes(value) },
    { name: "message", errorId: "message-error", label: "a message between 10 and 2,000 characters", validate: (value) => value.trim().length >= 10 && value.trim().length <= 2000 }
  ];

  const status = document.querySelector("#form-status");
  const submitButton = contactForm.querySelector('button[type="submit"]');
  if (!(status instanceof HTMLElement)) {
    throw new Error("Contact form is missing its status message.");
  }
  if (!(submitButton instanceof HTMLButtonElement)) {
    throw new Error("Contact form is missing its submit button.");
  }

  const messageField = contactForm.elements.namedItem("message");
  if (!(messageField instanceof HTMLTextAreaElement)) {
    throw new Error("Contact form is missing its message field.");
  }

  const recipient = "randeepaganganath68@gmail.com";
  const emailSubject = "Lingolift Website - Contact Form Message";
  const linksNotAllowedMessage = "Links are not allowed in messages. Please remove the link and try again.";
  const knownTopLevelDomains = [
    "com", "org", "net", "edu", "gov", "mil", "int", "io", "co", "uk", "lk",
    "us", "ca", "au", "nz", "in", "app", "dev", "info", "biz", "xyz", "ai", "me",
    "online", "site", "tech", "store", "blog", "cloud", "name", "pro", "mobi",
    "travel", "museum", "agency", "solutions", "website"
  ];
  const domainSeparator = String.raw`(?:\s*\.\s*|\s*(?:\[\s*(?:\.|dot)\s*\]|\(\s*(?:\.|dot)\s*\)|\bdot\b)\s*)`;
  const domainLabel = String.raw`[a-z0-9](?:[a-z0-9-]*[a-z0-9])?`;
  const urlPattern = new RegExp(
    String.raw`(?:^|[^a-z0-9_@])(?:https?\s*:\s*[/\\]\s*[/\\]\s*)?(?:www${domainSeparator})?${domainLabel}(?:${domainSeparator}${domainLabel})*${domainSeparator}(?:${knownTopLevelDomains.join("|")})(?=$|[^a-z0-9-])`,
    "i"
  );
  let isSubmitting = false;

  function setStatus(message, state = "info") {
    status.textContent = message;
    status.dataset.state = state;
  }

  function containsLink(value) {
    return urlPattern.test(value);
  }

  function updateMessageValidation(showLengthError = false) {
    const error = document.getElementById("message-error");
    if (!error) {
      throw new Error("Contact form is missing its message error message.");
    }

    const hasLink = containsLink(messageField.value);
    const isLongEnough = messageField.value.trim().length >= 10;
    const isWithinLimit = messageField.value.trim().length <= 2000;
    const isValid = !hasLink && isLongEnough && isWithinLimit;

    if (hasLink) {
      error.textContent = linksNotAllowedMessage;
    } else if (showLengthError && !isLongEnough) {
      error.textContent = "Please enter a message between 10 and 2,000 characters.";
    } else if (showLengthError && !isWithinLimit) {
      error.textContent = "Please enter a message between 10 and 2,000 characters.";
    } else {
      error.textContent = "";
    }

    messageField.setAttribute("aria-invalid", String(hasLink || (showLengthError && !isValid)));
    return isValid;
  }

  function areOtherFieldsValid() {
    return fields
      .filter(({ name }) => name !== "message")
      .every(({ name, validate }) => {
        const field = contactForm.elements.namedItem(name);
        return field && validate(field.value);
      });
  }

  function updateSubmitButton() {
    const messageLength = messageField.value.trim().length;
    const isMessageValid = !containsLink(messageField.value) &&
      messageLength >= 10 && messageLength <= 2000;
    submitButton.disabled = isSubmitting || !isMessageValid || !areOtherFieldsValid();
  }

  fields.forEach(({ name, errorId, label, validate }) => {
    const field = contactForm.elements.namedItem(name);
    const error = document.getElementById(errorId);
    if (!field || !error) {
      throw new Error(`Contact form configuration is missing the "${name}" field or its error message.`);
    }

    const validateField = (showError = false) => {
      const isValid = validate(field.value);
      if (showError) {
        error.textContent = isValid ? "" : `Please enter ${label.toLowerCase()}.`;
        field.setAttribute("aria-invalid", String(!isValid));
      } else if (isValid) {
        error.textContent = "";
        field.removeAttribute("aria-invalid");
      }
      updateSubmitButton();
      return isValid;
    };

    field.addEventListener("input", () => {
      if (name === "message") {
        updateMessageValidation(true);
        if (status.dataset.state === "error") setStatus("", "info");
        updateSubmitButton();
        return;
      }
      validateField(true);
      if (status.dataset.state === "error") setStatus("", "info");
    });
    field.addEventListener("change", () => {
      if (name === "message") {
        updateMessageValidation(true);
        updateSubmitButton();
        return;
      }
      validateField(true);
    });
  });

  contactForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (isSubmitting) return;

    let firstInvalidField = null;
    let hasErrors = false;

    fields.forEach(({ name, errorId, label, validate }) => {
      const field = contactForm.elements.namedItem(name);
      const error = document.getElementById(errorId);
      if (!(field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement) || !error) {
        throw new Error(`Contact form configuration is missing the "${name}" field or its error message.`);
      }

      const isValid = name === "message"
        ? updateMessageValidation(true)
        : validate(field.value);
      field.setAttribute("aria-invalid", String(!isValid));
      if (name !== "message") {
        error.textContent = isValid ? "" : `Please enter ${label.toLowerCase()}.`;
      }

      if (!isValid) {
        hasErrors = true;
        if (!firstInvalidField) firstInvalidField = field;
      }
    });

    if (hasErrors) {
      setStatus("Please check the highlighted fields and try again.", "error");
      firstInvalidField?.focus();
      return;
    }

    const name = contactForm.elements.namedItem("name").value;
    const email = contactForm.elements.namedItem("email").value;
    const selectedTopic = contactForm.elements.namedItem("subject").selectedOptions[0].textContent.trim();
    const message = messageField.value;
    const body = `Name: ${name}\n\nEmail: ${email}\n\nSubject: ${selectedTopic}\n\nMessage:\n${message}`;
    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(recipient)}&su=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(body)}`;
    let gmailWindow;
    try {
      gmailWindow = window.open(gmailUrl, "_blank");
    } catch {
      gmailWindow = null;
    }

    if (!gmailWindow) {
      setStatus("Your browser blocked the Gmail window. Allow pop-ups for this site and try again.", "error");
      updateSubmitButton();
      return;
    }

    gmailWindow.opener = null;
    isSubmitting = true;
    updateSubmitButton();
    setStatus("Gmail has opened in a new tab. Review the message and click Send in Gmail to send it.", "success");
  });

  updateSubmitButton();
}
