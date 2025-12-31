/**
 * StreamMetadata Web Component
 * A performant, encapsulated component for displaying streaming metadata
 * Uses open Shadow DOM for proper style isolation while remaining debuggable
 */

export interface StreamMetadataData {
  title: string;
  subtitle?: string;
  description?: string;
  rating?: number;
  year?: string;
  duration?: string;
  genres?: string[];
  imageUrl?: string;
  isLive?: boolean;
  viewers?: number;
}

class StreamMetadataElement extends HTMLElement {
  private _data: StreamMetadataData | null = null;
  private _observer: MutationObserver | null = null;

  static get observedAttributes() {
    return ['data'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.render();
    
    // Set up mutation observer for dynamic updates
    this._observer = new MutationObserver(() => this.render());
    this._observer.observe(this, { attributes: true });
  }

  disconnectedCallback() {
    this._observer?.disconnect();
  }

  attributeChangedCallback(name: string, _oldValue: string, newValue: string) {
    if (name === 'data' && newValue) {
      try {
        this._data = JSON.parse(newValue);
        this.render();
      } catch (e) {
        console.error('StreamMetadata: Invalid JSON data', e);
      }
    }
  }

  // Safe HTML escaping to prevent XSS
  private escapeHtml(str: string): string {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // Format number with K/M suffixes
  private formatViewers(num: number): string {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  }

  private getStyles(): string {
    return `
      :host {
        display: block;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        color: #e5e7eb;
        --accent-color: #8b5cf6;
        --bg-primary: #18181b;
        --bg-secondary: #27272a;
        --text-primary: #fafafa;
        --text-secondary: #a1a1aa;
        --text-muted: #71717a;
        --border-color: #3f3f46;
        --live-color: #ef4444;
        --rating-color: #facc15;
      }

      * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
      }

      .metadata-container {
        display: flex;
        gap: 1rem;
        padding: 1rem;
        background: var(--bg-primary);
        border-radius: 0.75rem;
        border: 1px solid var(--border-color);
        transition: background 0.2s ease;
      }

      .metadata-container:hover {
        background: var(--bg-secondary);
      }

      .thumbnail {
        flex-shrink: 0;
        width: 120px;
        height: 68px;
        border-radius: 0.5rem;
        overflow: hidden;
        background: var(--bg-secondary);
        position: relative;
      }

      .thumbnail img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .thumbnail-placeholder {
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--text-muted);
      }

      .live-badge {
        position: absolute;
        top: 0.25rem;
        left: 0.25rem;
        background: var(--live-color);
        color: white;
        font-size: 0.625rem;
        font-weight: 700;
        text-transform: uppercase;
        padding: 0.125rem 0.375rem;
        border-radius: 0.25rem;
        letter-spacing: 0.05em;
        animation: pulse 2s infinite;
      }

      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.7; }
      }

      .content {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
      }

      .header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 0.5rem;
      }

      .title {
        font-size: 1rem;
        font-weight: 600;
        color: var(--text-primary);
        line-height: 1.3;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .rating {
        display: flex;
        align-items: center;
        gap: 0.25rem;
        color: var(--rating-color);
        font-size: 0.875rem;
        font-weight: 500;
        flex-shrink: 0;
      }

      .rating-star {
        width: 0.875rem;
        height: 0.875rem;
      }

      .subtitle {
        font-size: 0.875rem;
        color: var(--text-secondary);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .meta-row {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.75rem;
        color: var(--text-muted);
        flex-wrap: wrap;
      }

      .meta-item {
        display: flex;
        align-items: center;
        gap: 0.25rem;
      }

      .meta-divider {
        width: 3px;
        height: 3px;
        border-radius: 50%;
        background: var(--text-muted);
      }

      .genres {
        display: flex;
        gap: 0.375rem;
        flex-wrap: wrap;
        margin-top: 0.25rem;
      }

      .genre-tag {
        font-size: 0.625rem;
        padding: 0.125rem 0.5rem;
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-radius: 9999px;
        color: var(--text-secondary);
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .description {
        font-size: 0.8125rem;
        color: var(--text-secondary);
        line-height: 1.5;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        margin-top: 0.25rem;
      }

      .viewers {
        display: flex;
        align-items: center;
        gap: 0.25rem;
        color: var(--live-color);
      }

      .viewers-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: var(--live-color);
      }

      .empty-state {
        padding: 2rem;
        text-align: center;
        color: var(--text-muted);
        font-size: 0.875rem;
      }

      /* Responsive adjustments */
      @media (max-width: 480px) {
        .metadata-container {
          flex-direction: column;
        }

        .thumbnail {
          width: 100%;
          height: 160px;
        }
      }
    `;
  }

  private render() {
    if (!this.shadowRoot) return;

    const data = this._data;

    if (!data) {
      this.shadowRoot.innerHTML = `
        <style>${this.getStyles()}</style>
        <div class="empty-state">No metadata available</div>
      `;
      return;
    }

    const thumbnailHtml = data.imageUrl
      ? `<img src="${this.escapeHtml(data.imageUrl)}" alt="${this.escapeHtml(data.title)}" loading="lazy" />`
      : `<div class="thumbnail-placeholder">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect>
            <line x1="7" y1="2" x2="7" y2="22"></line>
            <line x1="17" y1="2" x2="17" y2="22"></line>
            <line x1="2" y1="12" x2="22" y2="12"></line>
            <line x1="2" y1="7" x2="7" y2="7"></line>
            <line x1="2" y1="17" x2="7" y2="17"></line>
            <line x1="17" y1="17" x2="22" y2="17"></line>
            <line x1="17" y1="7" x2="22" y2="7"></line>
          </svg>
        </div>`;

    const liveBadgeHtml = data.isLive ? '<div class="live-badge">Live</div>' : '';

    const ratingHtml = data.rating
      ? `<div class="rating">
          <svg class="rating-star" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
          </svg>
          ${data.rating.toFixed(1)}
        </div>`
      : '';

    const subtitleHtml = data.subtitle
      ? `<div class="subtitle">${this.escapeHtml(data.subtitle)}</div>`
      : '';

    const metaItems: string[] = [];
    if (data.year) metaItems.push(`<span class="meta-item">${this.escapeHtml(data.year)}</span>`);
    if (data.duration) metaItems.push(`<span class="meta-item">${this.escapeHtml(data.duration)}</span>`);
    if (data.isLive && data.viewers) {
      metaItems.push(`
        <span class="meta-item viewers">
          <span class="viewers-dot"></span>
          ${this.formatViewers(data.viewers)} watching
        </span>
      `);
    }

    const metaRowHtml = metaItems.length
      ? `<div class="meta-row">${metaItems.join('<span class="meta-divider"></span>')}</div>`
      : '';

    const genresHtml = data.genres?.length
      ? `<div class="genres">${data.genres.map(g => `<span class="genre-tag">${this.escapeHtml(g)}</span>`).join('')}</div>`
      : '';

    const descriptionHtml = data.description
      ? `<div class="description">${this.escapeHtml(data.description)}</div>`
      : '';

    this.shadowRoot.innerHTML = `
      <style>${this.getStyles()}</style>
      <div class="metadata-container">
        <div class="thumbnail">
          ${thumbnailHtml}
          ${liveBadgeHtml}
        </div>
        <div class="content">
          <div class="header">
            <h3 class="title">${this.escapeHtml(data.title)}</h3>
            ${ratingHtml}
          </div>
          ${subtitleHtml}
          ${metaRowHtml}
          ${genresHtml}
          ${descriptionHtml}
        </div>
      </div>
    `;
  }
}

// Register the custom element
if (!customElements.get('stream-metadata')) {
  customElements.define('stream-metadata', StreamMetadataElement);
}

export { StreamMetadataElement };
