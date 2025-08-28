import { setValidity, validateEmail, validateCardNumber, validateExpiry, validateCVV, validateRequired, numericOnly } from '/js/validation.js';
import { setupAddressAutocomplete } from '/js/maps.js';

(function init() {
  const form = document.getElementById('checkoutForm');
  const modal = document.getElementById('modal');
  const modalMessage = document.getElementById('modalMessage');
  const closeModal = document.getElementById('closeModal');
  const productInput = document.getElementById('product1_id');

  // Extract productId from query
  const params = new URLSearchParams(window.location.search);
  const productId = params.get('productId');
  if (productId) productInput.value = productId;

  // Country dropdown from API
  const countrySelect = document.getElementById('country');
  fetch('/api/countries')
    .then(r => r.json())
    .then(data => {
      const countries = data?.message?.countries || [];
      countrySelect.innerHTML = countries.map(c => `<option value="${c.countryCode}">${c.countryName}</option>`).join('');
      // After populate, init maps autocomplete (async, no-op if api key missing)
      return setupAddressAutocomplete({ countrySelectId: 'country', enableMap: true });
    })
    .catch(() => {
      countrySelect.innerHTML = '<option value="">Select country</option>';
    });

  // Validation hooks
  const el = (id) => document.getElementById(id);
  const vmap = [
    ['emailAddress', validateEmail, 'emailError'],
    ['firstName', validateRequired, 'firstNameError'],
    ['lastName', validateRequired, 'lastNameError'],
    ['country', validateRequired, 'countryError'],
    ['address1', validateRequired, 'address1Error'],
    ['city', validateRequired, 'cityError'],
    ['state', validateRequired, 'stateError'],
    ['postalCode', validateRequired, 'postalCodeError'],
    ['cardNumber', validateCardNumber, 'cardNumberError'],
    ['cardMonth', (v)=>validateExpiry(v, el('cardYear').value), 'cardMonthError'],
    ['cardYear', (v)=>validateExpiry(el('cardMonth').value, v), 'cardYearError'],
    ['cardSecurityCode', validateCVV, 'cardSecurityCodeError']
  ];

  function attachRealtimeValidation([id, fn, errId]) {
    const input = el(id);
    const err = el(errId);
    if (!input) return;
    const handler = () => {
      const value = input.value;
      const { valid, message } = fn(value);
      setValidity(input, valid, err, message);
    };
    input.addEventListener('input', handler);
    input.addEventListener('blur', handler);
  }
  vmap.forEach(attachRealtimeValidation);

  // Mask numeric fields lightly
  el('cardNumber').addEventListener('input', (e) => {
    const digits = numericOnly(e.target.value).slice(0,19);
    e.target.value = digits.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
  });
  el('cardMonth').addEventListener('input', (e) => { e.target.value = numericOnly(e.target.value).slice(0,2); });
  el('cardYear').addEventListener('input', (e) => { e.target.value = numericOnly(e.target.value).slice(0,2); });
  el('cardSecurityCode').addEventListener('input', (e) => { e.target.value = numericOnly(e.target.value).slice(0,4); });

  // Partial lead create/update with debounce (500ms)
  let leadDebounceTimer = null;
  function getMinimumLeadFields() {
    return {
      firstName: el('firstName').value.trim(),
      lastName: el('lastName').value.trim(),
      emailAddress: el('emailAddress').value.trim(),
      product1_id: el('product1_id').value
    };
  }
  function minimumFieldsValid({ firstName, lastName, emailAddress, product1_id }) {
    return Boolean(firstName && lastName && product1_id && validateEmail(emailAddress).valid);
  }
  function schedulePartialLeadSync() {
    if (leadDebounceTimer) clearTimeout(leadDebounceTimer);
    leadDebounceTimer = setTimeout(async () => {
      const fields = getMinimumLeadFields();
      if (!minimumFieldsValid(fields)) return;
      const leadId = sessionStorage.getItem('partialLeadId') || undefined;
      try {
        const res = await fetch('/api/lead', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...fields, leadId })
        });
        const data = await res.json();
        if (data?.result === 'SUCCESS') {
          const newId = data?.message?.orderId;
          if (newId) sessionStorage.setItem('partialLeadId', newId);
        }
      } catch (_) {
        // ignore errors for background lead sync
      }
    }, 500);
  }
  ['firstName','lastName','emailAddress','product1_id'].forEach(id => {
    const input = el(id);
    if (input) input.addEventListener('input', schedulePartialLeadSync);
    if (input) input.addEventListener('blur', schedulePartialLeadSync);
  });

  function showModal(messageHtml) {
    modalMessage.innerHTML = messageHtml;
    modal.classList.remove('hidden');
  }
  function hideModal() {
    modal.classList.add('hidden');
  }
  closeModal.addEventListener('click', () => {
    hideModal();
    const go = closeModal.getAttribute('data-go');
    if (go) window.location.href = go;
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    // Run validations
    let allValid = true;
    vmap.forEach(([id, fn, errId]) => {
      const input = el(id); const err = el(errId);
      const { valid, message } = fn(input.value);
      setValidity(input, valid, err, message);
      if (!valid) allValid = false;
    });
    if (!allValid) return;

    // Gather payload
    const payload = {
      firstName: el('firstName').value.trim(),
      lastName: el('lastName').value.trim(),
      postalCode: el('postalCode').value.trim(),
      emailAddress: el('emailAddress').value.trim(),
      phoneNumber: el('phoneNumber').value.trim(),
      address1: el('address1').value.trim(),
      paySource: 'CREDITCARD',
      cardNumber: numericOnly(el('cardNumber').value),
      cardMonth: el('cardMonth').value.trim(),
      cardYear: el('cardYear').value.trim(),
      cardSecurityCode: el('cardSecurityCode').value.trim(),
      city: el('city').value.trim(),
      country: el('country').value,
      ipAddress: (await (await fetch('https://api.ipify.org?format=json')).json()).ip,
      state: el('state').value.trim(),
      product1_id: el('product1_id').value,
      billShipSame: 'YES',
      latitude: el('latitude').value || undefined,
      longitude: el('longitude').value || undefined
    };

    try {
      const res = await fetch('/api/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (data.result === 'SUCCESS') {
        const orderId = data?.message?.orderId;
        showModal(`<p>Transaction successful. Your order ID is ${orderId}</p>`);
        closeModal.setAttribute('data-go', `/thankyou.html?orderId=${encodeURIComponent(orderId)}&email=${encodeURIComponent(payload.emailAddress)}`);
      } else {
        const msg = data?.message || 'Payment failed';
        showModal(`<p class="error">${msg}</p>`);
        closeModal.removeAttribute('data-go');
      }
    } catch (err) {
      showModal(`<p class="error">${err?.message || 'Something went wrong'}</p>`);
      closeModal.removeAttribute('data-go');
    }
  });
})();


