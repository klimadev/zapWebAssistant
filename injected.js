(function() {
    // ============================
    // DEBUG SISTEMÁTICO - Injected Script
    // ============================
    const DEBUG = {
        prefix: '[WPP-INJECTED]',
        step: 0,
        
        log: function(msg, data = null) {
            const out = `${this.prefix}:${String(this.step).padStart(2,'0')} ${msg}`;
            if (data) {
                console.log(out, data);
            } else {
                console.log(out);
            }
            this.step++;
            return out;
        },
        
        error: function(context, err) {
            console.error(`${this.prefix}:${String(this.step).padStart(2,'0')} ERRO[${context}]`, {
                message: err?.message || String(err),
                type: err?.constructor?.name || typeof err,
                stack: err?.stack
            });
            this.step++;
        },
        
        warn: function(msg, data = null) {
            console.warn(`${this.prefix}:${String(this.step).padStart(2,'0')} WARN: ${msg}`, data);
            this.step++;
        },
        
        info: function(label, data) {
            console.info(`${this.prefix}:${String(this.step).padStart(2,'0')} ${label}`, data);
            this.step++;
        },
        
        separator: function(label = '') {
            console.log(`${this.prefix} --- ${label || 'SEPARATOR'} ---`);
        },
        
        reset: function() {
            this.step = 0;
        }
    };

    // --- Sistema de Logging para UI ---
    function dispatchStatus(msg) {
        window.dispatchEvent(new CustomEvent('WPP_EXT_STATUS', { detail: msg }));
    }

    // ============================
    // INÍCIO: Configuração e Leitura de Caminhos Locais
    // ============================
    DEBUG.separator('INICIALIZAÇÃO');
    DEBUG.log('Carregando script...');

    const myScript = document.currentScript || document.getElementById('wpp-extractor-injected');
    const JSZIP_URL = myScript?.dataset?.libJszip;
    const WPP_URL = myScript?.dataset?.libWpp;
    const FILTER_CONFIG_RAW = myScript?.dataset?.filterConfig;

    DEBUG.log('URLs das libs', { JSZIP_URL, WPP_URL });
    DEBUG.log('Filter config raw', FILTER_CONFIG_RAW);

    if (!JSZIP_URL || !WPP_URL) {
        DEBUG.error('INIT', new Error('Caminhos das bibliotecas não encontrados'));
        dispatchStatus("Erro interno: Libs não localizadas.");
        return;
    }

    const FILTER_CONFIG = FILTER_CONFIG_RAW 
        ? JSON.parse(FILTER_CONFIG_RAW) 
        : { mode: 'last_24h', includeAudio: true, includeImage: true };

    const INCLUDE_AUDIO = FILTER_CONFIG.includeAudio !== false;
    const INCLUDE_IMAGE = FILTER_CONFIG.includeImage !== false;

    DEBUG.log('Config carregada', FILTER_CONFIG);
    DEBUG.log('INCLUDE_AUDIO', INCLUDE_AUDIO);
    DEBUG.log('INCLUDE_IMAGE', INCLUDE_IMAGE);

    DEBUG.separator('CARREGADOR DE LIBS');
    
    // --- Função de Log wrappers ---
    function log(msg) {
        console.log(`${DEBUG.prefix} ${msg}`);
        dispatchStatus(msg);
    }
    function logError(msg) {
        console.error(`${DEBUG.prefix} ${msg}`);
        dispatchStatus(msg);
    }

    // --- Carregador de Scripts ---
    function loadScript(url, globalCheck) {
        DEBUG.log(`Carregando lib: ${globalCheck}`, { url, globalCheck, alreadyLoaded: !!window[globalCheck] });
        
        return new Promise((resolve, reject) => {
            if (window[globalCheck]) {
                DEBUG.log(`${globalCheck} já موجود no cache global`);
                dispatchStatus(`${globalCheck} já carregado.`);
                return resolve();
            }
            
            log(`⬇️ Carregando ${globalCheck}...`);
            
            let restoreDefine = null;
            if (globalCheck === 'JSZip' && window.define && window.define.amd) {
                DEBUG.log('Detectado AMD define, criando restore point');
                const originalDefine = window.define;
                window.define = undefined;
                restoreDefine = () => { window.define = originalDefine; };
            }

            const script = document.createElement('script');
            script.src = url;
            script.onload = () => {
                if (restoreDefine) restoreDefine();
                const loaded = !!window[globalCheck];
                DEBUG.log(`Script carregado: ${globalCheck}`, { loaded, restoreDefine: !!restoreDefine });
                if (!loaded) {
                    DEBUG.warn(`${globalCheck} não обнаружен no window após load`);
                }
                dispatchStatus(`${globalCheck} carregado.`);
                resolve();
            };
            script.onerror = (e) => {
                if (restoreDefine) restoreDefine();
                DEBUG.error(`LOAD_SCRIPT[${globalCheck}]`, new Error(`Falha ao carregar ${url}`));
                reject(new Error(`Falha ao carregar ${url}`));
            };
            document.head.appendChild(script);
            DEBUG.log(`Script tag criado e anexado ao head`);
        });
    }

    async function waitForWPP() {
        DEBUG.log('Aguardando WPP estar pronto...');
        
        if (!window.WPP) {
            DEBUG.error('WAIT_WPP', new Error('window.WPP não está definido'));
            throw new Error("WPP não definido.");
        }
        
        log("⏳ Aguardando WPP...");
        
        return new Promise((resolve) => {
            if (window.WPP.webpack?.isReady) {
                DEBUG.log('WPP webpack já está pronto (isReady=true)');
                resolve();
                return;
            }
            
            DEBUG.log('WPP webpack não pronto, registrando onReady callback');
            window.WPP.webpack.onReady(() => {
                DEBUG.log('WPP.onReady callback ejecutado');
                resolve();
            });
        });
    }

    // --- Helper de Nome do Remetente ---
    DEBUG.separator('HELPERS');
    
    function getSenderName(msg) {
        DEBUG.step--; // Não contar como step para não poluir muito
        
        let senderName = "Eu";
        if (!msg.fromMe) {
            const senderObj = msg.sender || {};
            
            DEBUG.info('getSenderName', {
                hasSenderObj: !!senderObj,
                pushname: senderObj.pushname,
                formattedName: senderObj.formattedName,
                name: senderObj.name,
                author: msg.author,
                from: msg.from
            });
            
            const name = senderObj.pushname || senderObj.formattedName || senderObj.name;
            
            if (name) {
                senderName = name;
            } else {
                const id = msg.author || msg.from;
                if (id) {
                    const rawId = typeof id === 'string' ? id : id._serialized;
                    const cleanId = rawId?.split('@')[0];
                    senderName = `+${cleanId}`;
                    DEBUG.log(`Usando ID como nome: ${senderName}`);
                } else {
                    senderName = "Desconhecido";
                }
            }
        }
        
        return senderName;
    }

    function normalizeMessages(messages) {
        DEBUG.log('Normalizando mensagens', {
            inputType: typeof messages,
            isArray: Array.isArray(messages),
            hasGetModelsArray: typeof messages?.getModelsArray === 'function',
            hasModels: Array.isArray(messages?.models),
            has_models: Array.isArray(messages?._models),
            hasToArray: typeof messages?.toArray === 'function'
        });
        
        if (!messages) return [];
        if (Array.isArray(messages)) return messages;
        if (typeof messages.getModelsArray === 'function') return messages.getModelsArray();
        if (Array.isArray(messages.models)) return messages.models;
        if (Array.isArray(messages._models)) return messages._models;
        if (typeof messages.toArray === 'function') return messages.toArray();
        
        DEBUG.warn('Formato de mensagem desconhecido');
        return [];
    }

    // --- Fetch de Mensagens ---
    DEBUG.separator('FETCH MENSAGENS');
    
    async function fetchChatMessages(chatId, activeChat) {
        const errors = [];
        DEBUG.log('Iniciando fetchChatMessages', { chatId, hasActiveChat: !!activeChat });

        // ========== Método 1: WPP.chat.getMessages ==========
        if (typeof window.WPP?.chat?.getMessages === 'function') {
            try {
                DEBUG.log('Método 1: WPP.chat.getMessages');
                const messages = await window.WPP.chat.getMessages(chatId, { count: -1 });
                const normalized = normalizeMessages(messages);

                DEBUG.log('Resultado getMessages', { count: normalized.length, firstMsg: normalized[0]?.id?._serialized });
                
                if (normalized.length > 0) {
                    DEBUG.log('Método 1 OK - usando these mensagens');
                    return normalized;
                }
            } catch (error) {
                DEBUG.error('METODO1', error);
                errors.push(`getMessages: ${error.message}`);
            }
        } else {
            DEBUG.warn('Método 1 não disponível - WPP.chat.getMessages不存在');
        }

        // ========== Método 2: loadAndGetAllMessagesInChat ==========
        if (typeof window.WPP?.chat?.loadAndGetAllMessagesInChat === 'function') {
            try {
                DEBUG.log('Método 2: loadAndGetAllMessagesInChat');
                const messages = await window.WPP.chat.loadAndGetAllMessagesInChat(chatId, true);
                const normalized = normalizeMessages(messages);

                DEBUG.log('Resultado loadAndGetAllMessagesInChat', { count: normalized.length });
                
                if (normalized.length > 0) {
                    DEBUG.log('Método 2 OK');
                    return normalized;
                }
            } catch (error) {
                DEBUG.error('METODO2', error);
                errors.push(`loadAndGetAllMessagesInChat: ${error.message}`);
            }
        } else {
            DEBUG.warn('Método 2 não disponível');
        }

        // ========== Método 3: Chat Ativo ==========
        if (activeChat && typeof activeChat === 'object') {
            try {
                DEBUG.log('Método 3: Tentando do chat ativo');

                if (typeof activeChat.loadEarlierMsgs === 'function') {
                    DEBUG.log('Usando loadEarlierMsgs');
                    for (let i = 0; i < 50; i++) {
                        DEBUG.log(`loadEarlierMsgs iteração ${i+1}`);
                        const loaded = await activeChat.loadEarlierMsgs();
                        if (!loaded) {
                            DEBUG.log(`Carregou ${i} iterações`);
                            break;
                        }
                        await new Promise(resolve => setTimeout(resolve, 150));
                    }
                } else if (typeof activeChat.loadEarlierMessages === 'function') {
                    DEBUG.log('Usando loadEarlierMessages');
                    for (let i = 0; i < 50; i++) {
                        DEBUG.log(`loadEarlierMessages iteração ${i+1}`);
                        const loaded = await activeChat.loadEarlierMessages();
                        if (!loaded) {
                            DEBUG.log(`Carregou ${i} iterações`);
                            break;
                        }
                        await new Promise(resolve => setTimeout(resolve, 150));
                    }
                }

                const normalized = normalizeMessages(activeChat.msgs);
                DEBUG.log('Resultado chat ativo', { count: normalized.length });
                
                if (normalized.length > 0) {
                    DEBUG.log('Método 3 OK');
                    return normalized;
                }
            } catch (error) {
                DEBUG.error('METODO3', error);
                errors.push(`chatAtivo: ${error.message}`);
            }
        } else {
            DEBUG.warn('Método 3 não disponível - activeChat inválido');
        }

        // ========== Falha Final ==========
        const errMsg = `Não foi possível obter mensagens. Erros: ${errors.join(' | ')}`.trim();
        DEBUG.error('FETCH_FINAL', new Error(errMsg));
        throw new Error(errMsg);
    }

    // ============================
    // LÓGICA PRINCIPAL DE EXTRAÇÃO
    // ============================
    DEBUG.separator('START_EXTraction');
    DEBUG.reset();
    
    async function startExtraction() {
        try {
            DEBUG.log('=== INICIANDO EXTRAÇÃO ===');
            dispatchStatus("🚀 Iniciando extração...");
            
            // --- Carregar JSZip ---
            DEBUG.log('01. Carregando JSZip...');
            await loadScript(JSZIP_URL, 'JSZip');
            const jszipLoaded = !!window.JSZip;
            DEBUG.log('JSZip disponível?', jszipLoaded);
            
            if (!jszipLoaded) {
                throw new Error("JSZip não carregou corretamente");
            }
            
            // --- Carregar WPP.connect ---
            DEBUG.log('02. Carregando WPP.connect...');
            await loadScript(WPP_URL, 'WPP');
            const wppLoaded = !!window.WPP;
            DEBUG.log('WPP disponível?', wppLoaded);
            
            if (!wppLoaded) {
                throw new Error("WPP não carregou corretamente");
            }
            
            // --- Aguardar WPP estar pronto ---
            DEBUG.log('03. Aguardando WPP pronto...');
            await waitForWPP();
            DEBUG.log('04. WPP pronto!');
            
            // ============================
            // 1. Identificar Chat Ativo
            // ============================
            DEBUG.separator('CHAT ATIVO');
            const activeChat = window.WPP.chat.getActiveChat();
            DEBUG.log('ActiveChat', { 
                type: typeof activeChat,
                hasId: !!activeChat?.id,
                id: activeChat?.id?._serialized || activeChat?.id 
            });
            
            let chatId = activeChat;
            if (chatId && typeof chatId === 'object') {
                if (chatId.id && chatId.id._serialized) chatId = chatId.id._serialized;
                else if (chatId.id) chatId = chatId.id;
            }

            DEBUG.log('chatId extraído', chatId);

            if (!chatId || typeof chatId !== 'string') {
                DEBUG.error('CHAT_ATIVO', new Error('Nenhum chat ativo'));
                throw new Error("Nenhum chat ativo encontrado. Abra uma conversa.");
            }
            
            log(`📂 Chat: ${chatId}`);
            DEBUG.log('05. Chat ativo OK');
            
            // --- Obter Nome do Contato ---
            DEBUG.log('06. Obtendo contato...');
            const contact = await window.WPP.contact.get(chatId);
            const chatName = contact.name || contact.pushname || contact.formattedName || chatId;
            
            DEBUG.log('Contato', {
                name: contact.name,
                pushname: contact.pushname,
                formattedName: contact.formattedName,
                chatName
            });
            
            // ============================
            // 2. Calcular Filtro de Tempo
            // ============================
            DEBUG.separator('FILTRO TEMPO');
            const now = Date.now();
            let minTimestampSeconds = null;
            let filterLabel = '';

            switch(FILTER_CONFIG.mode) {
              case 'last_24h':
                const twentyFourHoursAgo = now - (24 * 60 * 60 * 1000);
                minTimestampSeconds = Math.floor(twentyFourHoursAgo / 1000);
                filterLabel = 'Últimas 24h';
                DEBUG.log('Filtro: 24h', { minTimestampSeconds, twentyFourHoursAgo });
                break;
                
              case 'date_range':
                const fromDate = new Date(FILTER_CONFIG.fromDate);
                minTimestampSeconds = Math.floor(fromDate.getTime() / 1000);
                filterLabel = `Desde ${fromDate.toLocaleString('pt-BR')}`;
                DEBUG.log('Filtro: date_range', { fromDate, minTimestampSeconds });
                break;
                
              case 'last_x_days':
                const days = FILTER_CONFIG.days || 7;
                const xDaysAgo = now - (days * 24 * 60 * 60 * 1000);
                minTimestampSeconds = Math.floor(xDaysAgo / 1000);
                filterLabel = `Últimos ${days} dias`;
                DEBUG.log('Filtro: last_x_days', { days, minTimestampSeconds });
                break;
                
              case 'all':
                minTimestampSeconds = 0;
                filterLabel = 'Todas as mensagens';
                DEBUG.log('Filtro: all', { minTimestampSeconds });
                break;
                
              default:
                DEBUG.error('FILTER_SWITCH', new Error(`Modo inválido: ${FILTER_CONFIG.mode}`));
                throw new Error(`Modo de filtro inválido: ${FILTER_CONFIG.mode}`);
            }

            DEBUG.log('07. Filtro calculado', { filterLabel, minTimestampSeconds });
            
            // ============================
            // 3. Buscar Mensagens
            // ============================
            DEBUG.separator('BUSCAR MENSAGENS');
            log("🔍 Buscando mensagens...");
            
            const allMessages = await fetchChatMessages(chatId, activeChat);
            DEBUG.log('08. Mensagens buscadas', { total: allMessages.length });

            const filteredMessages = allMessages.filter(m => m.t >= minTimestampSeconds);
            DEBUG.log('09. Mensagens filtradas', { 
                totalOriginal: allMessages.length,
                totalFiltrado: filteredMessages.length,
                minTimestamp: minTimestampSeconds
            });

            if (filteredMessages.length === 0) {
              throw new Error(`Nenhuma mensagem encontrada (${filterLabel}).`);
            }

            log(`📊 ${filteredMessages.length} mensagens (${filterLabel}).`);

            // ============================
            // 4. Processamento e Download
            // ============================
            DEBUG.separator('PROCESSAMENTO');
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

            log("⚙️ Processando mensagens...");
            DEBUG.log('10. Preparando loop', { msgCount: filteredMessages.length });

            for (let i = 0; i < filteredMessages.length; i++) {
                const msg = filteredMessages[i];
                const dateStr = new Date(msg.t * 1000).toLocaleString();
                
                if (i % 50 === 0) {
                    DEBUG.log(`Processando msg ${i+1}/${filteredMessages.length}`, { 
                        msgId: msg.id?._serialized,
                        type: msg.type,
                        timestamp: msg.t
                    });
                }
                
                const sender = getSenderName(msg);
                
                let contentText = "";
                let audioFileName = null;
                let imageFileName = null;
                let isAudio = false;
                let isImage = false;

                // --- Identificar Tipo de Mensagem ---
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
                    if (INCLUDE_AUDIO) {
                        isAudio = true;
                        audioCount++;
                    }
                    contentText = "[ÁUDIO]";
                } else {
                    if (msg.body && !msg.body.startsWith('data:')) {
                        contentText = msg.body;
                    } else {
                        contentText = `[TIPO: ${msg.type?.toUpperCase() || 'DESCONHECIDO'}]`;
                    }
                }

                DEBUG.step--; // Não count tipo detection

                // --- Download de Áudio ---
                if (isAudio && INCLUDE_AUDIO) {
                    try {
                        DEBUG.log(`Baixando audio ${i+1}`, { 
                            msgId: msg.id?._serialized,
                            hasMimetype: !!msg.mimetype 
                        });
                        
                        let blob = await window.WPP.chat.downloadMedia(msg.id);
                        
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
                            
                            if (typeof blob === 'string' && !blob.startsWith('data:')) {
                                audioFolder.file(filename, blob, {base64: true});
                            } else {
                                audioFolder.file(filename, blob);
                            }

                            audioFileName = filename;
                            contentText += ` (Arquivo: audios/${filename})`;

                            if (successAudioCount % 2 === 0) log(`⬇️ Áudios: ${successAudioCount}`);
                            await new Promise(resolve => setTimeout(resolve, 300));
                        } else {
                            contentText += " (Falha: Download vazio)";
                            DEBUG.warn(`Audio download vazio`, { msgIndex: i });
                        }

                    } catch (err) {
                        DEBUG.error(`AUDIO_DOWNLOAD[${i}]`, err);
                        contentText += " (Erro no download)";
                    }
                }

                // --- Download de Imagem ---
                if (isImage && INCLUDE_IMAGE) {
                    try {
                        DEBUG.log(`Baixando imagem ${i+1}`, { 
                            msgId: msg.id?._serialized,
                            hasMimetype: !!msg.mimetype 
                        });
                        
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

                            if (successImageCount % 2 === 0) log(`🖼️ Imagens: ${successImageCount}`);
                            await new Promise(resolve => setTimeout(resolve, 300));
                        } else {
                            contentText += " (Falha: Download vazio)";
                            DEBUG.warn(`Image download vazio`, { msgIndex: i });
                        }

                    } catch (err) {
                        DEBUG.error(`IMAGE_DOWNLOAD[${i}]`, err);
                        contentText += " (Erro no download)";
                    }
                }

                // --- Caption ---
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

            // Stats finais
            metadata.stats.audios = audioCount;
            metadata.stats.audiosDownloaded = successAudioCount;
            metadata.stats.images = imageCount;
            metadata.stats.imagesDownloaded = successImageCount;

            DEBUG.separator('FINALIZAÇÃO');
            DEBUG.log('Stats finais', metadata.stats);
            log(`🖼️ Imagens: ${successImageCount}/${imageCount}`);
            
            // ============================
            // 5. Gerar ZIP
            // ============================
            DEBUG.log('11. Gerando ZIP...');
            log("📦 Gerando ZIP final...");
            
            zip.file("conversas.txt", txtContent);
            zip.file("metadados.json", JSON.stringify(metadata, null, 2));

            const zipBlob = await zip.generateAsync({type: "blob"});
            
            DEBUG.log('ZIP gerado', { size: zipBlob.size });
            
            const url = URL.createObjectURL(zipBlob);
            const a = document.createElement('a');
            a.href = url;
            const fileNameSuffix = filterLabel.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
            a.download = `WhatsApp_${chatName.replace(/[^a-z0-9]/gi, '_')}_${fileNameSuffix}.zip`;
            
            DEBUG.log('Download filename', a.download);
            
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            DEBUG.log('12. ZIP baixado!');
            log("✅ Extração concluída!");

            // Guardar contexto para a sidebar
            const contextData = JSON.stringify(metadata);
            DEBUG.log('13. Enviando contexto para sidebar', { 
                chatName,
                msgCount: metadata.messages.length,
                hasAudio: successAudioCount > 0,
                hasImage: successImageCount > 0
            });
            
            window.dispatchEvent(new CustomEvent('WPP_EXT_CONTEXT', { detail: contextData }));

        } catch (error) {
            DEBUG.error('EXTRAÇÃO_FINAL', error);
            logError(`❌ Erro: ${error.message}`);
        }
    }

    DEBUG.log('Script inicializado, chamando startExtraction()');
    startExtraction();
})();
