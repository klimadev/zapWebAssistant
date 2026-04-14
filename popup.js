const modeSelect = document.getElementById('extractMode');
const dateRangeFields = document.getElementById('dateRangeFields');
const lastXDaysFields = document.getElementById('lastXDaysFields');
const fromDateInput = document.getElementById('fromDate');
const fromTimeInput = document.getElementById('fromTime');
const daysCountInput = document.getElementById('daysCount');
const btnExtract = document.getElementById('btnExtract');
const statusDiv = document.getElementById('status');

modeSelect.addEventListener('change', () => {
  const mode = modeSelect.value;
  
  dateRangeFields.classList.toggle('visible', mode === 'date_range');
  lastXDaysFields.classList.toggle('visible', mode === 'last_x_days');
});

function getFilterConfig() {
  const mode = modeSelect.value;
  
  switch(mode) {
    case 'last_24h':
      return { mode: 'last_24h' };
      
    case 'date_range':
      const date = fromDateInput.value;
      const time = fromTimeInput.value;
      if (!date) throw new Error('Selecione uma data válida.');
      return {
        mode: 'date_range',
        fromDate: new Date(`${date}T${time}`).toISOString()
      };
      
    case 'last_x_days':
      const days = parseInt(daysCountInput.value);
      if (!days || days < 1) throw new Error('Número de dias inválido.');
      return { mode: 'last_x_days', days };
      
    case 'all':
      return { mode: 'all' };
      
    default:
      throw new Error('Modo inválido.');
  }
}

function getModeLabel(mode) {
  const labels = {
    'last_24h': 'Últimas 24h',
    'date_range': 'Data específica',
    'last_x_days': 'Últimos dias',
    'all': 'Todas'
  };
  return labels[mode] || mode;
}

function addLog(message, isError = false) {
  const entry = document.createElement('div');
  entry.className = 'log-entry' + (isError ? ' error' : '');
  entry.textContent = message;
  statusDiv.appendChild(entry);
  statusDiv.scrollTop = statusDiv.scrollHeight;
}

btnExtract.addEventListener('click', async () => {
  try {
    const filterConfig = getFilterConfig();
    
    btnExtract.disabled = true;
    statusDiv.innerHTML = '';
    addLog(`🚀 Iniciando extração (${getModeLabel(filterConfig.mode)})...`);
    
    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    if (!tab?.id) throw new Error('Nenhuma aba ativa encontrada.');
    
    chrome.tabs.sendMessage(tab.id, {
      action: "start_extraction",
      filter: filterConfig
    }, (response) => {
      if (chrome.runtime.lastError) {
        addLog(`❌ ${chrome.runtime.lastError.message}`, true);
        addLog('Certifique-se de estar na aba do WhatsApp Web.');
        btnExtract.disabled = false;
      } else {
        addLog('💉 Script injetado!');
      }
    });
    
  } catch (error) {
    addLog(`❌ ${error.message}`, true);
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "update_status") {
    addLog(request.message);
    
    if (request.message.includes("concluído") || request.message.includes("Erro")) {
      btnExtract.disabled = false;
    }
  }
});