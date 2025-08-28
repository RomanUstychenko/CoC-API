// Basic client-side validators with real-time feedback

function setValidity(el, valid, messageEl, message) {
  if (!el) return;
  if (valid) {
    el.classList.add('valid');
    el.classList.remove('invalid');
    if (messageEl) messageEl.textContent = '';
  } else {
    el.classList.remove('valid');
    el.classList.add('invalid');
    if (messageEl) messageEl.textContent = message || 'Invalid field';
  }
}

function validateEmail(value) {
  if (!value) return { valid: false, message: 'Email is required' };
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  return { valid: re.test(value), message: 'Invalid email format' };
}

function numericOnly(str) {
  return (str || '').replace(/\D/g, '');
}

function validateCardNumber(value) {
  const digits = numericOnly(value);
  if (digits.length < 12 || digits.length > 19) {
    return { valid: false, message: 'Card number must be 12-19 digits' };
  }
  // Luhn check
  let sum = 0;
  let shouldDouble = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = parseInt(digits[i], 10);
    if (shouldDouble) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    shouldDouble = !shouldDouble;
  }
  const valid = sum % 10 === 0;
  return { valid, message: 'Invalid card number' };
}

function validateExpiry(month, year) {
  const m = parseInt(month, 10);
  const y = parseInt(year, 10);
  if (isNaN(m) || isNaN(y)) return { valid: false, message: 'Enter MM/YY' };
  if (m < 1 || m > 12) return { valid: false, message: 'Invalid month' };
  // normalize year: assume 20YY
  const fullYear = 2000 + y;
  const now = new Date();
  const exp = new Date(fullYear, m - 1, 1);
  exp.setMonth(exp.getMonth() + 1); // end of month
  const valid = exp > now;
  return { valid, message: 'Card is expired' };
}

function validateCVV(value) {
  const digits = numericOnly(value);
  return { valid: digits.length === 3 || digits.length === 4, message: '3 or 4 digits' };
}

function validateRequired(value) {
  return { valid: Boolean((value || '').trim()), message: 'Required field' };
}

export {
  setValidity,
  validateEmail,
  validateCardNumber,
  validateExpiry,
  validateCVV,
  validateRequired,
  numericOnly
};


