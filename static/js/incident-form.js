// On submit, capture the entered text values so the confirmation page can build the SPD
// packet. We do NOT preventDefault: Netlify still handles the real POST, reCAPTCHA, spam
// filtering, and the photo upload exactly as before. sessionStorage is written first, so it
// survives even if reCAPTCHA interrupts before navigation.
const form = document.querySelector("form.incident-form");
if (form) {
  form.addEventListener("submit", () => {
    const data = {};
    new FormData(form).forEach((value, key) => {
      if (typeof value === "string") data[key] = value; // skip the File (attachment)
    });
    try {
      sessionStorage.setItem("incidentSubmission", JSON.stringify(data));
    } catch (e) {
      /* private mode / storage disabled — confirmation page will show a generic message */
    }
  });
}
