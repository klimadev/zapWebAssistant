/* eslint-disable @typescript-eslint/no-explicit-any */

// Runtime globals carregados via libs/ no contexto da página
declare var WPP: any;
declare var JSZip: any;

interface Window {
  JSZip: any;
  WPP: any;
  webkitSpeechRecognition: any;
  SpeechRecognition: any;
}
