export function initializeLoginForm() {
  const toggle = document.getElementById("toggleLoginPassword");
  const input = document.getElementById("loginPassword");
  if (!toggle || !input) return;
  toggle.addEventListener("click", () => {
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    toggle.textContent = show ? "پنهان" : "نمایش";
    toggle.setAttribute("aria-label", show ? "پنهان‌کردن رمز عبور" : "نمایش رمز عبور");
    toggle.setAttribute("aria-pressed", String(show));
    input.focus();
  });
}
