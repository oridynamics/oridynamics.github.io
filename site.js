(() => {
  'use strict';
  const dialog = document.querySelector('#figure-dialog');
  const picture = document.querySelector('#dialog-img');
  let previousFocus;
  document.querySelectorAll('[data-figure]').forEach(button => {
    button.addEventListener('click', () => {
      previousFocus = button;
      picture.src = button.dataset.figure;
      picture.alt = button.querySelector('img').alt;
      document.querySelector('#dialog-caption').textContent = button.dataset.title;
      document.querySelector('#original-figure').href = button.dataset.figure;
      document.querySelector('.dialog-image').scrollTop = 0;
      dialog.showModal();
      document.body.classList.add('dialog-open');
    });
  });
  document.querySelector('#close-dialog').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    const box = dialog.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
  });
  dialog.addEventListener('close', () => {
    document.body.classList.remove('dialog-open');
    previousFocus?.focus();
  });
  document.querySelector('#copy-citation').addEventListener('click', async () => {
    const citation = document.querySelector('#citation-text');
    const status = document.querySelector('#copy-status');
    try {
      await navigator.clipboard.writeText(citation.textContent);
      status.textContent = 'BibTeX copied.';
    } catch {
      const range = document.createRange();
      range.selectNodeContents(citation);
      const selection = window.getSelection();
      selection.removeAllRanges(); selection.addRange(range);
      status.textContent = 'Citation selected. Copy with Ctrl+C or ⌘C.';
    }
  });
})();
