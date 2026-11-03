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
  const submitLabel = submitButton?.querySelector("[data-submit-label]");
  const formControls = contactForm.querySelectorAll("input, select, textarea");
  if (!(status instanceof HTMLElement)) {
    throw new Error("Contact form is missing its status message.");
  }
  if (!(submitButton instanceof HTMLButtonElement) || !(submitLabel instanceof HTMLElement)) {
    throw new Error("Contact form is missing its submit button.");
  }

  let isSubmitting = false;

  function setStatus(message, state = "info") {
    status.textContent = message;
    status.dataset.state = state;
  }

  function getSubmissionErrorMessage(error) {
    const statusCode = error?.context?.status;
    if (statusCode === 429) {
      return "Please wait a little while before sending another message.";
    }
    if (statusCode === 400) {
      return "Please check your contact details and try again.";
    }
    return "We couldn't send your message right now. Please try again later.";
  }

  contactForm.addEventListener("submit", async (event) => {
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

      const isValid = validate(field.value);
      field.setAttribute("aria-invalid", String(!isValid));
      error.textContent = isValid ? "" : `Please enter ${label.toLowerCase()}.`;

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

    const honeypot = contactForm.elements.namedItem("website");
    if (!(honeypot instanceof HTMLInputElement)) {
      throw new Error("Contact form is missing its spam-protection field.");
    }

    isSubmitting = true;
    submitButton.disabled = true;
    formControls.forEach((control) => {
      control.disabled = true;
    });
    submitLabel.textContent = "Sending...";
    contactForm.setAttribute("aria-busy", "true");
    setStatus("Sending your message...", "info");

    try {
      const response = await fetch("https://lingolift-website.randeepaganganath68.workers.dev/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: contactForm.elements.namedItem("name").value,
          email: contactForm.elements.namedItem("email").value,
          subject: contactForm.elements.namedItem("subject").value,
          message: contactForm.elements.namedItem("message").value,
          website: honeypot.value,
        }),
      });

      let data;
      try {
        data = await response.json();
      } catch {
        setStatus(getSubmissionErrorMessage({ context: { status: response.status } }), "error");
        return;
      }

      if (!response.ok || data?.ok !== true) {
        setStatus(getSubmissionErrorMessage({ context: { status: response.status } }), "error");
        return;
      }

      contactForm.reset();
      fields.forEach(({ name, errorId }) => {
        contactForm.elements.namedItem(name).removeAttribute("aria-invalid");
        document.getElementById(errorId).textContent = "";
      });
      setStatus("Message Sent Successfully! Thank you for contacting Lingolift. We'll get back to you soon.", "success");
    } catch (error) {
      setStatus(getSubmissionErrorMessage(error), "error");
    } finally {
      isSubmitting = false;
      submitButton.disabled = false;
      formControls.forEach((control) => {
        control.disabled = false;
      });
      submitLabel.textContent = "Send Message";
      contactForm.removeAttribute("aria-busy");
    }
  });

  fields.forEach(({ name, errorId }) => {
    const field = contactForm.elements.namedItem(name);
    field?.addEventListener("input", () => {
      field.removeAttribute("aria-invalid");
      const error = document.getElementById(errorId);
      if (error) error.textContent = "";
      if (status.dataset.state === "error") setStatus("", "info");
    });
  });

  submitButton.disabled = false;
}
