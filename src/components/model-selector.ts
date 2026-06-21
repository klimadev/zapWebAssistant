// ModelSelector — reusable dropdown component for model selection
// Renders: button with selected model name + dropdown with search + provider groups
// Features: search filter, keyboard nav (↑↓↵Esc), outside-click close
// Framework-agnostic, no dependencies

import { IconChevronDown, IconCheck, IconSearch } from '../utils/icons';

export interface ModelInfo {
  id: string;
  provider: string;
  selected?: boolean;
}

export interface ModelSelectorConfig {
  baseUrl: string;
  apiKey: string;
  defaultModel: string;
  onSelect?: (modelId: string) => void;
  onLoad?: (models: ModelInfo[]) => void;
  onError?: (error: Error) => void;
  /** Placeholder label when no model selected yet */
  label?: string;
}

const PROVIDER_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  google: 'Google',
  qwen: 'Qwen',
  other: 'Outros',
};

function classifyModel(id: string): string {
  if (id.startsWith('gpt-')) return 'openai';
  if (id.startsWith('gemini')) return 'google';
  if (id.startsWith('coder')) return 'qwen';
  if (id.startsWith('o')) return 'openai';
  if (id.startsWith('claude')) return 'other';
  if (id.startsWith('llama')) return 'other';
  return 'other';
}

export class ModelSelector {
  private config: ModelSelectorConfig;
  private models: ModelInfo[] = [];
  private open = false;
  private container: HTMLElement;
  private btn!: HTMLElement;
  private nameSpan!: HTMLElement;
  private arrow!: HTMLElement;
  private menu!: HTMLElement;
  private searchInput!: HTMLInputElement;
  private itemsContainer!: HTMLElement;
  private selectEl!: HTMLSelectElement;
  private onDocClick: (e: MouseEvent) => void;
  private onKeyDown: (e: KeyboardEvent) => void;

  constructor(containerEl: HTMLElement, config: ModelSelectorConfig) {
    this.config = config;
    this.container = containerEl;
    this.container.classList.add('model-selector');

    // Build DOM
    this.render();
    this.onDocClick = (e) => this.handleDocClick(e);
    this.onKeyDown = (e) => this.handleKeyDown(e);
    document.addEventListener('click', this.onDocClick);
    document.addEventListener('keydown', this.onKeyDown);

    // Load models if apiKey present
    if (config.apiKey) {
      this.loadModels().catch(() => {});
    }
  }

  // ─── DOM Builder ────────────────────────────────────────────

  private render(): void {
    // Hidden native select for form compatibility
    this.selectEl = document.createElement('select');
    this.selectEl.id = 'modelSelect';
    this.selectEl.style.display = 'none';
    this.container.appendChild(this.selectEl);

    // Button
    this.btn = document.createElement('button');
    this.btn.type = 'button';
    this.btn.className = 'model-btn';
    this.btn.id = 'modelDropdownBtn';
    this.btn.innerHTML = `<span id="selectedModelName">${this.config.label ?? this.escape(this.config.defaultModel)}</span>`;
    this.arrow = document.createElement('span');
    this.arrow.className = 'arrow';
    this.arrow.innerHTML = IconChevronDown();
    this.btn.appendChild(this.arrow);
    this.container.appendChild(this.btn);

    // Menu
    this.menu = document.createElement('div');
    this.menu.className = 'model-menu';
    this.menu.id = 'modelDropdownMenu';

    this.searchInput = document.createElement('input');
    this.searchInput.type = 'text';
    this.searchInput.className = 'model-search-input';
    this.searchInput.placeholder = 'Buscar modelo…';
    this.menu.appendChild(this.searchInput);

    this.itemsContainer = document.createElement('div');
    this.itemsContainer.className = 'model-items-container';
    this.menu.appendChild(this.itemsContainer);

    this.container.appendChild(this.menu);

    // Button click toggle
    this.btn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggle();
    });

    // Search input
    this.searchInput.addEventListener('input', () => this.filter());
  }

  // ─── Public API ─────────────────────────────────────────────

  async loadModels(): Promise<void> {
    if (!this.config.apiKey) {
      this.nameSpan = this.container.querySelector('#selectedModelName') ?? this.nameSpan;
      if (this.nameSpan) this.nameSpan.textContent = 'Sem chave API';
      return;
    }

    try {
      const response = await fetch(`${this.config.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.config.apiKey}` },
      });
      if (!response.ok) {
        const errBody = await response.json().catch(() => ({})) as { error?: { message?: string } };
        throw new Error(errBody.error?.message ?? `HTTP ${response.status}`);
      }
      const data = (await response.json()) as { data?: Array<{ id: string }> };
      if (!data.data) throw new Error('Resposta inválida (esperado { data: [...] })');

      const sorted = data.data.map((m) => m.id).sort();
      const groups: Record<string, string[]> = { openai: [], google: [], qwen: [], other: [] };
      for (const id of sorted) {
        groups[classifyModel(id)]?.push(id);
      }
      // Also push vision model from config
      if (sorted.length > 0) {
        groups.other.push('vision-model');
      }

      this.models = [];
      this.selectEl.innerHTML = '';
      this.itemsContainer.innerHTML = '';

      for (const [provider, ids] of Object.entries(groups)) {
        if (ids.length === 0) continue;

        const header = document.createElement('div');
        header.className = 'model-provider';
        header.textContent = PROVIDER_LABELS[provider] ?? provider;
        this.itemsContainer.appendChild(header);

        for (const id of ids) {
          this.models.push({ id, provider });
          const opt = document.createElement('option');
          opt.value = id;
          opt.textContent = id;
          this.selectEl.appendChild(opt);

          const item = document.createElement('div');
          item.className = 'model-item';
          item.dataset.id = id;
          item.textContent = id;
          item.onclick = () => this.select(id);
          this.itemsContainer.appendChild(item);
        }
      }

      // Auto-select first or default
      const firstId = this.models[0]?.id ?? this.config.defaultModel;
      this.select(firstId);
      this.config.onLoad?.(this.models);
    } catch (error) {
      const nameSpan = this.container.querySelector('#selectedModelName') ?? this.nameSpan;
      if (nameSpan) nameSpan.textContent = 'Erro';
      this.config.onError?.(error as Error);
    }
  }

  select(modelId: string): void {
    this.models.forEach((m) => (m.selected = m.id === modelId));
    this.selectEl.value = modelId;

    const nameSpan = this.container.querySelector('#selectedModelName') as HTMLElement;
    if (nameSpan) nameSpan.textContent = modelId;

    this.itemsContainer.querySelectorAll('.model-item').forEach((el) => {
      el.classList.toggle('selected', (el as HTMLElement).dataset.id === modelId);
    });

    this.close();
    this.config.onSelect?.(modelId);
  }

  getSelectedModel(): string {
    return this.selectEl.value || this.config.defaultModel;
  }

  updateConfig(config: Partial<ModelSelectorConfig>): void {
    Object.assign(this.config, config);
  }

  /** Reload models with new config credentials */
  async reload(): Promise<void> {
    await this.loadModels();
  }

  destroy(): void {
    document.removeEventListener('click', this.onDocClick);
    document.removeEventListener('keydown', this.onKeyDown);
    this.container.innerHTML = '';
  }

  // ─── Internals ──────────────────────────────────────────────

  private toggle(): void {
    this.open ? this.close() : this.openMenu();
  }

  private openMenu(): void {
    this.open = true;
    this.menu.classList.add('open');
    this.btn.classList.add('open');
    this.searchInput.value = '';
    this.filter();
    setTimeout(() => this.searchInput.focus(), 50);
  }

  private close(): void {
    this.open = false;
    this.menu.classList.remove('open');
    this.btn.classList.remove('open');
  }

  private filter(): void {
    const q = this.searchInput.value.toLowerCase();
    let curProvider: HTMLElement | null = null;
    for (let i = 0; i < this.itemsContainer.children.length; i++) {
      const el = this.itemsContainer.children[i] as HTMLElement;
      if (el.classList.contains('model-provider')) {
        curProvider = el;
        el.style.display = 'none';
      } else if (el.classList.contains('model-item')) {
        const match = !q || (el.dataset.id?.toLowerCase().includes(q) ?? false);
        el.style.display = match ? '' : 'none';
        if (match && curProvider) curProvider.style.display = '';
      }
    }
  }

  private handleDocClick(e: MouseEvent): void {
    if (!this.container.contains(e.target as Node)) {
      this.close();
    }
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (!this.open) {
      // Ctrl+Space to open from anywhere in container
      if ((e.ctrlKey || e.metaKey) && e.key === ' ' && this.container.contains(e.target as Node)) {
        e.preventDefault();
        this.openMenu();
      }
      return;
    }

    const items = Array.from(this.itemsContainer.querySelectorAll<HTMLElement>('.model-item[style*="display: none"]')) as never[];
    const visible = Array.from(this.itemsContainer.querySelectorAll<HTMLElement>('.model-item:not([style*="display: none"])'));
    if (visible.length === 0) return;

    const currentIdx = visible.findIndex((el) => el.classList.contains('focused'));
    let nextIdx = -1;

    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        e.preventDefault();
        const dir = e.key === 'ArrowDown' ? 1 : -1;
        nextIdx = currentIdx === -1 ? (dir === 1 ? 0 : visible.length - 1) : Math.max(0, Math.min(visible.length - 1, currentIdx + dir));
        break;
      }
      case 'Enter':
      case ' ': {
        e.preventDefault();
        if (currentIdx >= 0 && currentIdx < visible.length) {
          const id = visible[currentIdx]!.dataset.id;
          if (id) this.select(id);
        }
        return;
      }
      case 'Escape': {
        e.preventDefault();
        this.close();
        this.btn.focus();
        return;
      }
      default:
        return;
    }

    // Update focus
    visible.forEach((el, i) => el.classList.toggle('focused', i === nextIdx));
    if (nextIdx >= 0) {
      visible[nextIdx]?.scrollIntoView({ block: 'nearest' });
    }
  }

  private escape(s: string): string {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }
}
