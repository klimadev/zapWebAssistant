(async function() {
    // --- Configuração e Leitura de Caminhos Locais ---
    const myScript = document.currentScript || document.getElementById('wpp-extractor-injected');
    const JSZIP_URL = myScript?.dataset?.libJszip;
    const WPP_URL = myScript?.dataset?.libWpp;

    if (!JSZIP_URL || !WPP_URL) {
        console.error("ERRO CRÍTICO: Caminhos das bibliotecas não encontrados.");
        window.dispatchEvent(new CustomEvent('WPP_EXT_STATUS', { detail: "Erro interno: Libs não localizadas." }));
        return;
    }

    const FILTER_CONFIG = myScript?.dataset?.filterConfig 
        ? JSON.parse(myScript.dataset.filterConfig) 
        : { mode: 'last_24h' };

    // --- Helpers de Comunicação ---
    function log(msg) {
        console.log(`[WPP-EXT] ${msg}`);
        window.dispatchEvent(new CustomEvent('WPP_EXT_STATUS', { detail: msg }));
    }

    // --- Carregador de Scripts ---
    function loadScript(url, globalCheck) {
        return new Promise((resolve, reject) => {
            if (window[globalCheck]) {
                log(`📦 ${globalCheck} já carregado.`);
                return resolve();
            }
            log(`⬇️ Carregando ${globalCheck} localmente...`);
            
            let restoreDefine = null;
            if (globalCheck === 'JSZip' && window.define && window.define.amd) {
                const originalDefine = window.define;
                window.define = undefined;
                restoreDefine = () => { window.define = originalDefine; };
            }

            const script = document.createElement('script');
            script.src = url;
            script.onload = () => {
                if (restoreDefine) restoreDefine();
                log(`✅ ${globalCheck} carregado.`);
                resolve();
            };
            script.onerror = () => {
                if (restoreDefine) restoreDefine();
                reject(new Error(`Falha ao carregar ${url}`));
            };
            document.head.appendChild(script);
        });
    }

    async function waitForWPP() {
        if (!window.WPP) throw new Error("WPP não definido.");
        log("⏳ Aguardando WPP estar pronto...");
        return new Promise((resolve) => {
            if (window.WPP.webpack.isReady) return resolve();
            window.WPP.webpack.onReady(() => resolve());
        });
    }

    // --- Helper de Nome do Remetente ---
    function getSenderName(msg) {
        if (msg.fromMe) return "Eu";
        
        // Tenta pegar o objeto do remetente
        const senderObj = msg.sender || {};
        
        // Prioridade: Nome salvo na agenda (pushname) > Nome formatado > User ID (Número)
        // Em grupos, msg.author contém o ID real de quem enviou
        const name = senderObj.pushname || senderObj.formattedName || senderObj.name;
        
        if (name) return name;

        // Fallback para o número de telefone limpo
        const id = msg.author || msg.from;
        if (id) {
            // Remove @c.us ou @g.us e pega o número
            const cleanId = (typeof id === 'string' ? id : id._serialized).split('@')[0];
            return `+${cleanId}`;
        }

        return "Desconhecido";
    }

    function normalizeMessages(messages) {
        if (!messages) return [];
        if (Array.isArray(messages)) return messages;
        if (typeof messages.getModelsArray === 'function') return messages.getModelsArray();
        if (Array.isArray(messages.models)) return messages.models;
        if (Array.isArray(messages._models)) return messages._models;
        if (typeof messages.toArray === 'function') return messages.toArray();
        return [];
    }

    async function fetchChatMessages(chatId, activeChat) {
        const errors = [];

        if (typeof window.WPP?.chat?.getMessages === 'function') {
            try {
                log("🔍 Buscando mensagens via WPP.chat.getMessages...");
                const messages = await window.WPP.chat.getMessages(chatId, { count: -1 });
                const normalized = normalizeMessages(messages);

                if (normalized.length > 0) {
                    return normalized;
                }
            } catch (error) {
                console.warn('Falha ao usar WPP.chat.getMessages:', error);
                errors.push(`getMessages: ${error.message}`);
            }
        }

        if (typeof window.WPP?.chat?.loadAndGetAllMessagesInChat === 'function') {
            try {
                log("🔁 Tentando fallback via loadAndGetAllMessagesInChat...");
                const messages = await window.WPP.chat.loadAndGetAllMessagesInChat(chatId, true);
                const normalized = normalizeMessages(messages);

                if (normalized.length > 0) {
                    return normalized;
                }
            } catch (error) {
                console.warn('Falha ao usar loadAndGetAllMessagesInChat:', error);
                errors.push(`loadAndGetAllMessagesInChat: ${error.message}`);
            }
        }

        if (activeChat && typeof activeChat === 'object') {
            try {
                log("🧩 Tentando recuperar mensagens do chat ativo...");

                if (typeof activeChat.loadEarlierMsgs === 'function') {
                    for (let i = 0; i < 50; i++) {
                        const loaded = await activeChat.loadEarlierMsgs();
                        if (!loaded) break;
                        await new Promise(resolve => setTimeout(resolve, 150));
                    }
                } else if (typeof activeChat.loadEarlierMessages === 'function') {
                    for (let i = 0; i < 50; i++) {
                        const loaded = await activeChat.loadEarlierMessages();
                        if (!loaded) break;
                        await new Promise(resolve => setTimeout(resolve, 150));
                    }
                }

                const normalized = normalizeMessages(activeChat.msgs);
                if (normalized.length > 0) {
                    return normalized;
                }
            } catch (error) {
                console.warn('Falha ao recuperar mensagens do chat ativo:', error);
                errors.push(`chatAtivo: ${error.message}`);
            }
        }

        throw new Error(`Nao foi possivel obter as mensagens do chat. ${errors.join(' | ')}`.trim());
    }

    // --- Lógica Principal ---
    async function startExtraction() {
        try {
            log("🔄 Inicializando...");
            await loadScript(JSZIP_URL, 'JSZip');
            await loadScript(WPP_URL, 'WPP');
            await waitForWPP();

            // 1. Identificar Chat Ativo
            const activeChat = window.WPP.chat.getActiveChat();
            let chatId = activeChat;
            if (chatId && typeof chatId === 'object') {
                if (chatId.id && chatId.id._serialized) chatId = chatId.id._serialized;
                else if (chatId.id) chatId = chatId.id;
            }

            if (!chatId || typeof chatId !== 'string') {
                throw new Error("Nenhum chat ativo encontrado. Abra uma conversa.");
            }
            
            log(`📂 Chat ativo: ${chatId}`);

            const contact = await window.WPP.contact.get(chatId);
            const chatName = contact.name || contact.pushname || contact.formattedName || chatId;

            const now = Date.now();
            let minTimestampSeconds = null;
            let filterLabel = '';

            switch(FILTER_CONFIG.mode) {
              case 'last_24h':
                const twentyFourHoursAgo = now - (24 * 60 * 60 * 1000);
                minTimestampSeconds = Math.floor(twentyFourHoursAgo / 1000);
                filterLabel = 'Últimas 24h';
                break;
                
              case 'date_range':
                const fromDate = new Date(FILTER_CONFIG.fromDate);
                minTimestampSeconds = Math.floor(fromDate.getTime() / 1000);
                const dateStr = fromDate.toLocaleString('pt-BR');
                filterLabel = `Desde ${dateStr}`;
                break;
                
              case 'last_x_days':
                const days = FILTER_CONFIG.days || 7;
                const xDaysAgo = now - (days * 24 * 60 * 60 * 1000);
                minTimestampSeconds = Math.floor(xDaysAgo / 1000);
                filterLabel = `Últimos ${days} dias`;
                break;
                
              case 'all':
                minTimestampSeconds = 0;
                filterLabel = 'Todas as mensagens';
                break;
                
              default:
                throw new Error(`Modo de filtro inválido: ${FILTER_CONFIG.mode}`);
            }

            log("🔍 Buscando mensagens...");
            const allMessages = await fetchChatMessages(chatId, activeChat);

            const filteredMessages = allMessages.filter(m => m.t >= minTimestampSeconds);

            if (filteredMessages.length === 0) {
              throw new Error(`Nenhuma mensagem encontrada (${filterLabel}).`);
            }

            log(`📊 Encontradas ${filteredMessages.length} mensagens (${filterLabel}).`);

            const zip = new JSZip();
            const audioFolder = zip.folder("audios");
            const imageFolder = zip.folder("imagens");
            
            let txtContent = `Extrato de Conversa: ${chatName}\n`;
            txtContent += `Filtro: ${filterLabel}\n`;
            txtContent += `Gerado em: ${new Date().toLocaleString()}\n`;
            txtContent += `Total Mensagens: ${filteredMessages.length}\n\n`;
            
            const metadata = {
                chatName,
                chatId,
                extractedAt: new Date().toISOString(),
                filter: {
                    mode: FILTER_CONFIG.mode,
                    label: filterLabel
                },
                stats: { total: filteredMessages.length, audios: 0, audiosDownloaded: 0, images: 0, imagesDownloaded: 0 },
                messages: []
            };

            let audioCount = 0;
            let successAudioCount = 0;
            let imageCount = 0;
            let successImageCount = 0;

            log("⚙️ Processando mensagens e baixando mídias...");

            for (let i = 0; i < filteredMessages.length; i++) {
                const msg = filteredMessages[i];
                const dateStr = new Date(msg.t * 1000).toLocaleString();
                
                const sender = getSenderName(msg);
                
                let contentText = "";
                let audioFileName = null;
                let imageFileName = null;
                let isAudio = false;
                let isImage = false;

                // --- Lógica de Conteúdo (Sem Base64 para Mídia) ---
                
                if (msg.type === 'chat') {
                    contentText = msg.body || "";
                } else if (msg.type === 'image') {
                    isImage = true;
                    imageCount++;
                    contentText = "[IMAGEM]";
                } else if (msg.type === 'video') {
                    contentText = "[VIDEO]";
                } else if (msg.type === 'sticker') {
                    contentText = "[STICKER]";
                } else if (msg.type === 'document') {
                    contentText = `[DOCUMENTO] ${msg.filename || ''}`;
                } else if (msg.type === 'location') {
                    contentText = `[LOCALIZAÇÃO]`;
                } else if (msg.type === 'vcard' || msg.type === 'multi_vcard') {
                    contentText = `[CONTATO]`;
                } else if (msg.type === 'audio' || msg.type === 'ptt' || msg.mediaType === 'audio' || msg.mediaType === 'ptt') {
                    isAudio = true;
                    audioCount++;
                    contentText = `[ÁUDIO]`;
                } else {
                    if (msg.body && !msg.body.startsWith('data:')) {
                        contentText = msg.body;
                    } else {
                        contentText = `[TIPO: ${msg.type.toUpperCase()}]`;
                    }
                }

                // --- Download de Áudio ---
                if (isAudio) {
                    try {
                        let blob = await window.WPP.chat.downloadMedia(msg.id);
                        
                        // Conversão de DataURI para Blob se necessário
                        if (typeof blob === 'string' && blob.startsWith('data:')) {
                             blob = await fetch(blob).then(r => r.blob());
                        }

                        if (blob) {
                            successAudioCount++;
                            
                            const timestamp = new Date(msg.t * 1000).toISOString().replace(/[:.]/g, '-').slice(0, 19);
                            const msgIdFull = msg.id.id || (msg.id._serialized ? msg.id._serialized.split('_')[0] : 'unknown');
                            const cleanId = msgIdFull.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12);

                            let extension = 'ogg';
                            if (msg.mimetype) {
                                const ext = msg.mimetype.split('/')[1];
                                if (ext && !ext.includes(';')) extension = ext;
                            }

                            const filename = `audio_${timestamp}_${cleanId}.${extension}`;
                            
                            // Adicionar ao ZIP
                            if (typeof blob === 'string' && !blob.startsWith('data:')) {
                                audioFolder.file(filename, blob, {base64: true});
                            } else {
                                audioFolder.file(filename, blob);
                            }

                            audioFileName = filename;
                            contentText += ` (Arquivo: audios/${filename})`;

                            if (successAudioCount % 2 === 0) log(`⬇️ Áudios baixados: ${successAudioCount}`);
                            await new Promise(resolve => setTimeout(resolve, 300));
                        } else {
                            contentText += " (Falha: Download vazio)";
                        }

                    } catch (err) {
                        console.error(`Erro audio ${msg.id._serialized}:`, err);
                        contentText += " (Erro no download)";
                    }
                }

                // --- Download de Imagem ---
                if (isImage) {
                    try {
                        let blob = await window.WPP.chat.downloadMedia(msg.id);
                        
                        if (typeof blob === 'string' && blob.startsWith('data:')) {
                             blob = await fetch(blob).then(r => r.blob());
                        }

                        if (blob) {
                            successImageCount++;
                            
                            const timestamp = new Date(msg.t * 1000).toISOString().replace(/[:.]/g, '-').slice(0, 19);
                            const msgIdFull = msg.id.id || (msg.id._serialized ? msg.id._serialized.split('_')[0] : 'unknown');
                            const cleanId = msgIdFull.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12);

                            let extension = 'jpg';
                            if (msg.mimetype) {
                                const ext = msg.mimetype.split('/')[1];
                                if (ext && !ext.includes(';')) extension = ext;
                            }

                            const filename = `imagem_${timestamp}_${cleanId}.${extension}`;
                            
                            if (typeof blob === 'string' && !blob.startsWith('data:')) {
                                imageFolder.file(filename, blob, {base64: true});
                            } else {
                                imageFolder.file(filename, blob);
                            }

                            imageFileName = filename;
                            contentText += ` (Arquivo: imagens/${filename})`;

                            if (successImageCount % 2 === 0) log(`🖼️ Imagens baixadas: ${successImageCount}`);
                            await new Promise(resolve => setTimeout(resolve, 300));
                        } else {
                            contentText += " (Falha: Download vazio)";
                        }

                    } catch (err) {
                        console.error(`Erro imagem ${msg.id._serialized}:`, err);
                        contentText += " (Erro no download)";
                    }
                }

                // --- Legenda (Caption) ---
                if (msg.caption) {
                    contentText += `\n   Legenda: ${msg.caption}`;
                }

                // Adicionar ao TXT
                txtContent += `[${dateStr}] ${sender}: ${contentText}\n------------------------------------------\n`;
                
                // Adicionar ao JSON
                metadata.messages.push({
                    id: msg.id,
                    timestamp: msg.t,
                    sender: sender,
                    type: msg.type,
                    content: contentText,
                    audioFile: audioFileName,
                    imageFile: imageFileName
                });
            }

            metadata.stats.audios = audioCount;
            metadata.stats.audiosDownloaded = successAudioCount;
            metadata.stats.images = imageCount;
            metadata.stats.imagesDownloaded = successImageCount;

            log(`🖼️ Imagens: ${successImageCount}/${imageCount}`);
            log("📦 Gerando ZIP final...");
            zip.file("conversas.txt", txtContent);
            zip.file("metadados.json", JSON.stringify(metadata, null, 2));

            const zipBlob = await zip.generateAsync({type: "blob"});
            
            const url = URL.createObjectURL(zipBlob);
            const a = document.createElement('a');
            a.href = url;
            const fileNameSuffix = filterLabel.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
            a.download = `WhatsApp_${chatName.replace(/[^a-z0-9]/gi, '_')}_${fileNameSuffix}.zip`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            log("✅ Extração concluída!");

        } catch (error) {
            console.error(error);
            log(`❌ Erro: ${error.message}`);
        }
    }

    startExtraction();
})();
