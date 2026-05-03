import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// ── Validación nativa del navegador en español ─────────────────
document.addEventListener('invalid', e => {
  const el = e.target;
  el.setCustomValidity('');          // limpia antes de evaluar
  if (el.validity.valueMissing) {
    el.setCustomValidity('Este campo es obligatorio.');
  } else if (el.validity.typeMismatch) {
    if (el.type === 'email') el.setCustomValidity('Ingresa un correo electrónico válido.');
    else if (el.type === 'url') el.setCustomValidity('Ingresa una URL válida.');
    else el.setCustomValidity('El formato no es válido.');
  } else if (el.validity.tooShort) {
    el.setCustomValidity(`Mínimo ${el.minLength} caracteres.`);
  } else if (el.validity.tooLong) {
    el.setCustomValidity(`Máximo ${el.maxLength} caracteres.`);
  } else if (el.validity.patternMismatch) {
    el.setCustomValidity('El formato ingresado no es válido.');
  } else if (el.validity.rangeUnderflow) {
    el.setCustomValidity(`El valor mínimo es ${el.min}.`);
  } else if (el.validity.rangeOverflow) {
    el.setCustomValidity(`El valor máximo es ${el.max}.`);
  }
}, true);

// Resetear el mensaje al escribir para que no quede bloqueado
document.addEventListener('input', e => {
  e.target.setCustomValidity?.('');
}, true);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);