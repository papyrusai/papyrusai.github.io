(function(){
  function initializeCustomDropdowns(){
    const selects = document.querySelectorAll('select.reversa-select');
    selects.forEach((nativeSelect)=>{
      if (nativeSelect.dataset.customized === '1') return;
      nativeSelect.dataset.customized = '1';
      nativeSelect.style.display = 'none';

      const wrapper = document.createElement('div');
      wrapper.className = 'custom-select';

      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'custom-select-toggle';
      toggle.setAttribute('aria-haspopup','listbox');
      toggle.setAttribute('aria-expanded','false');
      toggle.innerHTML = `<span class="custom-select-label">${getSelectedOptionText(nativeSelect)}</span><i class="fas fa-chevron-down custom-select-caret"></i>`;

      const menu = document.createElement('div');
      menu.className = 'custom-select-menu';
      menu.setAttribute('role','listbox');

      Array.from(nativeSelect.options).forEach((opt)=>{
        const item = document.createElement('div');
        item.className = 'custom-select-option';
        item.setAttribute('role','option');
        item.dataset.value = opt.value;
        item.textContent = opt.textContent;
        if (opt.selected) item.classList.add('selected');
        item.onclick = (e)=>{
          e.stopPropagation();
          nativeSelect.value = opt.value;
          updateCustomSelectSelection(menu, item);
          const labelEl = toggle.querySelector('.custom-select-label');
          if (labelEl) labelEl.textContent = opt.textContent;
          closeAllCustomSelects();
          // disparar change
          nativeSelect.dispatchEvent(new Event('change'));
        };
        menu.appendChild(item);
      });

      toggle.onclick = (e)=>{
        e.stopPropagation();
        const isOpen = menu.classList.contains('open');
        closeAllCustomSelects();
        if (!isOpen){
          menu.style.minWidth = `${toggle.getBoundingClientRect().width}px`;
          menu.classList.add('open');
          toggle.setAttribute('aria-expanded','true');
        }
      };

      wrapper.appendChild(toggle);
      wrapper.appendChild(menu);
      nativeSelect.parentNode.insertBefore(wrapper, nativeSelect);
      wrapper.appendChild(nativeSelect);
    });
  }

  function getSelectedOptionText(selectEl){
    const sel = selectEl.options[selectEl.selectedIndex];
    return sel ? sel.textContent : '';
  }

  function updateCustomSelectSelection(menu, selectedItem){
    menu.querySelectorAll('.custom-select-option').forEach(el=> el.classList.remove('selected'));
    selectedItem.classList.add('selected');
  }

  function closeAllCustomSelects(){
    document.querySelectorAll('.custom-select-menu.open').forEach(m=>{
      m.classList.remove('open');
      const toggle = m.previousElementSibling;
      if (toggle && toggle.classList.contains('custom-select-toggle')){
        toggle.setAttribute('aria-expanded','false');
      }
    });
  }

  document.addEventListener('click', closeAllCustomSelects);

  // expone globalmente para poder llamarlo desde generarContenido
  window.initializeCustomDropdowns = initializeCustomDropdowns;
})();
