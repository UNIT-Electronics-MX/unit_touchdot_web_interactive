document.getElementById('copy-btn').addEventListener('click', async () => {
    const code = document.getElementById('code-block').innerText.trim();
    try {
      await navigator.clipboard.writeText(code);
      const status = document.getElementById('copy-status');
      status.textContent = '¡Código copiado!';
      status.classList.remove('invisible');

      setTimeout(() => status.classList.add('invisible'), 2000);
    } catch (err) {
      console.error('Error copiando al portapapeles:', err);
    }
  });