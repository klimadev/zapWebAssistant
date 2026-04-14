function injectScript(file_path, filterConfig) {
    const oldScript = document.getElementById('wpp-extractor-injected');
    if (oldScript) oldScript.remove();

    var script = document.createElement('script');
    script.id = 'wpp-extractor-injected';
    script.setAttribute('type', 'text/javascript');
    script.setAttribute('src', chrome.runtime.getURL(file_path));
    
    script.dataset.libJszip = chrome.runtime.getURL('libs/jszip.min.js');
    script.dataset.libWpp = chrome.runtime.getURL('libs/wppconnect-wa.js');
    script.dataset.filterConfig = JSON.stringify(filterConfig);

    script.onload = function() {
        this.remove(); 
    };
    (document.head || document.documentElement).appendChild(script);
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "start_extraction") {
        console.log("[Content] Recebido comando de extração.");
        console.log("[Content] Config de filtro:", request.filter);
        injectScript('injected.js', request.filter);
        sendResponse({status: "Injeção iniciada"});
    }
    return true;
});

window.addEventListener("WPP_EXT_STATUS", function(event) {
    if (event.detail) {
        chrome.runtime.sendMessage({
            action: "update_status",
            message: event.detail
        }).catch(err => {});
    }
}, false);