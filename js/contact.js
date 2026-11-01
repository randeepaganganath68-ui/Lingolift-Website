"use strict";

const contactForm = document.querySelector("#contact-form");

if (contactForm instanceof HTMLFormElement) {
  const fields = [
    { name: "name", errorId: "name-error", label: "Your name", validate: (value) => value.trim().length >= 2 },
    { name: "email", errorId: "email-error", label: "A valid email address", validate: (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) },
    { name: "subject", errorId: "subject-error", label: "A topic", validate: (value) => value.trim().length > 0 },
    { name: "message", errorId: "message-error", label: "A message of at least 10 characters", validate: (value) => value.trim().length >= 10 }
  ];

  const status = document.querySelector("#form-status");

  contactForm.addEventListener("submit", (event) => {
    event.preventDefault();
    let firstInvalidField = null;
    let hasErrors = false;

    fields.forEach(({ name, errorId, label, validate }) => {
      const field = contactForm.elements.namedItem(name);
      const error = document.getElementById(errorId);
      if (!(field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement) || !error) {
        throw new Error(`Contact form configuration is missing the "${name}" field or its error message.`);
      }

      const isValid = validate(field.value);
      field.setAttribute("aria-invalid", String(!isValid));
      error.textContent = isValid ? "" : `Please enter ${label.toLowerCase()}.`;

      if (!isValid) {
        hasErrors = true;
        if (!firstInvalidField) firstInvalidField = field;
      }
    });

    if (hasErrors) {
      if (status) status.textContent = "Please check the highlighted fields and try again.";
      firstInvalidField?.focus();
      return;
    }

    if (status) {
      status.textContent = "Your message looks good. This demo form does not send or store messages, so please use an official Lingolift contact channel when one is published.";
    }
  });

  fields.forEach(({ name }) => {
    const field = contactForm.elements.namedItem(name);
    field?.addEventListener("input", () => {
      field.removeAttribute("aria-invalid");
      const errorId = fields.find((item) => item.name === name)?.errorId;
      const error = errorId ? document.getElementById(errorId) : null;
      if (error) error.textContent = "";
    });
  });
}
