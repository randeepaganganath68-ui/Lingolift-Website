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
  if (!(submitButton instanceof HTMLButtonElement)) {
    throw new Error("Contact form is missing its submit button.");
  }

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

  submitButton.disabled = false;
}
