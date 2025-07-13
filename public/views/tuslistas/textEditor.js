/*Índice del archivo:
1. Funciones para la barra de herramientas de edición
2. Funciones para el formato del texto
3. Funciones para la copia del contenido generado
4. Funciones para la descarga como PDF
5. Event listeners para la edición
6. Funciones para el dropdown de exportar
*/

// ==================== FUNCIONES PARA EL EDITOR DE TEXTO ====================

// Funciones para la barra de herramientas de edición
function toggleEditing() {
  const content = document.getElementById('contenido-html');
  const toolbar = document.querySelector('.editor-toolbar');
  const editBtn = document.querySelector('.edit-content-btn');
  
  if (!content || !toolbar || !editBtn) {
    console.error('Required elements not found for editing toggle');
    return;
  }
  
  if (content.contentEditable === 'true') {
    // Finalizar edición
    content.contentEditable = 'false';
    toolbar.style.display = 'none';
    editBtn.innerHTML = '<i class="fas fa-edit"></i> Editar';
    editBtn.classList.remove('active');
    console.log('Editing mode disabled');
  } else {
    // Iniciar edición
    content.contentEditable = 'true';
    toolbar.style.display = 'flex';
    editBtn.innerHTML = '<i class="fas fa-save"></i> Finalizar';
    editBtn.classList.add('active');
    content.focus();
    console.log('Editing mode enabled, content is now editable');
    
    // Verificar que el contenido es realmente editable
    setTimeout(() => {
      if (content.contentEditable === 'true') {
        console.log('Content editability confirmed');
      } else {
        console.error('Content is not editable after toggle');
      }
    }, 100);
  }
}

function formatText(command, value = null) {
  const content = document.getElementById('contenido-html');
  if (!content) {
    console.error('contenido-html element not found');
    return;
  }
  
  // Asegurar que el contenido esté enfocado y editable
  content.focus();
  
  if (content.contentEditable !== 'true') {
    console.warn('Content is not editable, cannot format text');
    return;
  }
  
  try {
    const success = document.execCommand(command, false, value);
    if (!success && command === 'foreColor') {
      console.warn('execCommand foreColor failed, trying manual approach');
      // Para colores, intentar método manual si execCommand falla
      if (value) {
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
          applyColorToSelectionManually(selection, value);
        }
      }
    }
    console.log(`formatText executed: ${command}${value ? ' with value: ' + value : ''}`, success ? 'SUCCESS' : 'FAILED');
  } catch (error) {
    console.error('Error in formatText:', error);
  }
}

function changeFontSize(size) {
  if (size) {
    const content = document.getElementById('contenido-html');
    content.focus();
    formatText('fontSize', size);
  }
}

function updateToolbarState() {
  // Actualizar estado de botones según la selección actual
  const boldBtn = document.querySelector('[onclick="formatText(\'bold\')"]');
  const italicBtn = document.querySelector('[onclick="formatText(\'italic\')"]');
  const underlineBtn = document.querySelector('[onclick="formatText(\'underline\')"]');
  
  if (boldBtn) boldBtn.classList.toggle('active', document.queryCommandState('bold'));
  if (italicBtn) italicBtn.classList.toggle('active', document.queryCommandState('italic'));
  if (underlineBtn) underlineBtn.classList.toggle('active', document.queryCommandState('underline'));
}

// Función para copiar el contenido generado
async function copyGeneratedContent() {
  const contenidoHtml = document.getElementById('contenido-html');
  const exportButton = document.querySelector('.export-btn');
  
  if (!contenidoHtml) {
    alert('No hay contenido para copiar');
    return;
  }
  
  try {
    // Crear una versión del contenido con estilos inline para mantener el formato
    const styledContent = createStyledContentForCopy(contenidoHtml);
    
    // Intentar copiar usando la API moderna primero
    if (navigator.clipboard && window.isSecureContext) {
      // Crear elementos para clipboard
      const clipboardItem = new ClipboardItem({
        'text/html': new Blob([styledContent], { type: 'text/html' }),
        'text/plain': new Blob([contenidoHtml.textContent || contenidoHtml.innerText], { type: 'text/plain' })
      });
      
      await navigator.clipboard.write([clipboardItem]);
    } else {
      // Fallback para navegadores más antiguos
      const tempTextArea = document.createElement('textarea');
      tempTextArea.value = contenidoHtml.textContent || contenidoHtml.innerText;
      tempTextArea.style.position = 'fixed';
      tempTextArea.style.left = '-9999px';
      document.body.appendChild(tempTextArea);
      tempTextArea.select();
      document.execCommand('copy');
      document.body.removeChild(tempTextArea);
    }
    
    // Mostrar feedback visual
    showCopyFeedback(exportButton);
    
  } catch (error) {
    console.error('Error copying content:', error);
    
    // Fallback: copiar solo texto plano
    try {
      const textContent = contenidoHtml.textContent || contenidoHtml.innerText;
      await navigator.clipboard.writeText(textContent);
      showCopyFeedback(exportButton);
    } catch (textError) {
      console.error('Error copying text:', textError);
      alert('Error al copiar el contenido. Por favor, selecciona y copia manualmente.');
    }
  }
}

// Función para crear contenido con estilos inline para copiar
function createStyledContentForCopy(container) {
  const clone = container.cloneNode(true);
  
  // Aplicar estilos inline para mantener el formato al pegar
  const headings = clone.querySelectorAll('h1, h2, h3, h4, h5, h6');
  headings.forEach(heading => {
    const currentColor = heading.style.color || '#04db8d';
    heading.style.cssText = `color: ${currentColor}; font-weight: 600; margin: 20px 0 10px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;`;
  });
  
  const paragraphs = clone.querySelectorAll('p');
  paragraphs.forEach(p => {
    const currentColor = p.style.color || '#455862';
    p.style.cssText = `color: ${currentColor}; line-height: 1.6; margin: 10px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;`;
  });
  
  const lists = clone.querySelectorAll('ul, ol');
  lists.forEach(list => {
    list.style.cssText = `padding-left: 20px; margin: 10px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;`;
  });
  
  const listItems = clone.querySelectorAll('li');
  listItems.forEach(li => {
    const currentColor = li.style.color || '#455862';
    li.style.cssText = `color: ${currentColor}; line-height: 1.6; margin: 5px 0;`;
  });
  
  const boldElements = clone.querySelectorAll('b, strong');
  boldElements.forEach(bold => {
    const currentColor = bold.style.color || '#0b2431';
    bold.style.cssText = `color: ${currentColor}; font-weight: 600;`;
  });
  
  const tables = clone.querySelectorAll('table');
  tables.forEach(table => {
    table.style.cssText = `width: 100%; border-collapse: collapse; margin: 15px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;`;
  });
  
  const tableCells = clone.querySelectorAll('th, td');
  tableCells.forEach(cell => {
    cell.style.cssText = `border: 1px solid #dee2e6; padding: 8px 12px; text-align: left;`;
  });
  
  const tableHeaders = clone.querySelectorAll('th');
  tableHeaders.forEach(th => {
    th.style.cssText += `background-color: rgba(4, 219, 141, 0.1); font-weight: 600;`;
  });
  
  // Añadir estilos generales al contenedor
  clone.style.cssText = `font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #455862;`;
  
  return clone.outerHTML;
}

// Función para mostrar feedback visual del copiado
function showCopyFeedback(button) {
  const originalIcon = button.innerHTML;
  button.innerHTML = '<i class="fas fa-check"></i>';
  button.classList.add('copied');
  
  setTimeout(() => {
    button.innerHTML = originalIcon;
    button.classList.remove('copied');
  }, 2000);
}

// Función para descargar como PDF (sin abrir nueva pestaña)
async function downloadAsPDF() {
  try {
    const content = document.getElementById('contenido-html');
    if (!content || !content.innerHTML.trim()) {
      alert('No hay contenido para descargar');
      return;
    }

    // Crear un elemento temporal para el PDF
    const printContent = document.createElement('div');
    printContent.innerHTML = content.innerHTML;
    
    // Aplicar estilos para el PDF
    printContent.style.fontFamily = 'Arial, sans-serif';
    printContent.style.fontSize = '12px';
    printContent.style.lineHeight = '1.6';
    printContent.style.color = '#333';
    printContent.style.maxWidth = '100%';
    
    // Crear contenido HTML completo para imprimir
    const printHTML = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Documento Generado</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            font-size: 12px;
            line-height: 1.6;
            color: #333;
            margin: 20px;
            max-width: 100%;
          }
          h1, h2, h3, h4, h5, h6 {
            color: #0b2431;
            margin-top: 20px;
            margin-bottom: 10px;
          }
          p {
            margin-bottom: 10px;
          }
          ul, ol {
            margin-bottom: 10px;
            padding-left: 20px;
          }
          table {
            border-collapse: collapse;
            width: 100%;
            margin-bottom: 15px;
          }
          th, td {
            border: 1px solid #ddd;
            padding: 8px;
            text-align: left;
          }
          th {
            background-color: #f2f2f2;
          }
          .logo-container {
            text-align: center;
            margin-bottom: 20px;
          }
          .logo-container img {
            max-width: 150px;
            max-height: 100px;
          }
          @media print {
            body { margin: 0; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        ${printContent.innerHTML}
      </body>
      </html>
    `;
    
    // Crear un blob con el contenido HTML
    const blob = new Blob([printHTML], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    
    // Crear un iframe oculto para imprimir
    const iframe = document.createElement('iframe');
    iframe.style.position = 'absolute';
    iframe.style.top = '-10000px';
    iframe.style.left = '-10000px';
    iframe.style.width = '1px';
    iframe.style.height = '1px';
    
    document.body.appendChild(iframe);
    
    iframe.onload = function() {
      setTimeout(() => {
        try {
          iframe.contentWindow.print();
          // Limpiar después de un tiempo
          setTimeout(() => {
            document.body.removeChild(iframe);
            URL.revokeObjectURL(url);
          }, 1000);
        } catch (error) {
          console.error('Error printing:', error);
          // Fallback: descargar como archivo HTML
          const link = document.createElement('a');
          link.href = url;
          link.download = 'documento-generado.html';
          link.click();
          document.body.removeChild(iframe);
          URL.revokeObjectURL(url);
        }
      }, 100);
    };
    
    iframe.src = url;
    
  } catch (error) {
    console.error('Error al generar PDF:', error);
    alert('Error al generar el PDF. Por favor, intenta de nuevo.');
  }
}

// Event listeners para la edición
document.addEventListener('DOMContentLoaded', function() {
  // Actualizar estado de la barra de herramientas cuando cambie la selección
  document.addEventListener('selectionchange', updateToolbarState);
  
  // Manejar teclas de atajo
  document.addEventListener('keydown', function(e) {
    const contenidoHtml = document.getElementById('contenido-html');
    if (contenidoHtml && contenidoHtml.contentEditable === 'true') {
      if (e.ctrlKey || e.metaKey) {
        switch(e.key.toLowerCase()) {
          case 'b':
            e.preventDefault();
            formatText('bold');
            break;
          case 'i':
            e.preventDefault();
            formatText('italic');
            break;
          case 'u':
            e.preventDefault();
            formatText('underline');
            break;
        }
      }
    }
  });

  // Cerrar dropdown de exportar cuando se hace click fuera
  document.addEventListener('click', function(e) {
    const exportDropdown = document.querySelector('.export-dropdown');
    const exportDropdownContent = document.getElementById('export-dropdown-content');
    
    // Only check if both elements exist, the dropdown is currently shown, and e.target exists
    if (exportDropdown && exportDropdownContent && exportDropdownContent.classList.contains('show') && e.target) {
      if (!exportDropdown.contains(e.target)) {
        exportDropdownContent.classList.remove('show');
      }
    }
  });
});

// ==================== EXPORT DROPDOWN FUNCTIONS ====================

// Función para mostrar/ocultar el dropdown de exportar
function toggleExportDropdown() {
  const dropdownContent = document.getElementById('export-dropdown-content');
  if (dropdownContent) {
    dropdownContent.classList.toggle('show');
  }
}

// Función para ocultar el dropdown de exportar
function hideExportDropdown() {
  const dropdownContent = document.getElementById('export-dropdown-content');
  if (dropdownContent) {
    dropdownContent.classList.remove('show');
  }
}
