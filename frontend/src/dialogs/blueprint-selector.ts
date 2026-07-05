import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import type { HomeAssistant, Blueprint, BlueprintsResponse } from "../types";
import { wsType, navigateTo, navigate, assetUrl } from "../helpers";
import "../switch-manager-dialog";

const iconPath =
  "M13 5C15.21 5 17 6.79 17 9C17 10.5 16.2 11.77 15 12.46V11.24C15.61 10.69 16 9.89 16 9C16 7.34 14.66 6 13 6S10 7.34 10 9C10 9.89 10.39 10.69 11 11.24V12.46C9.8 11.77 9 10.5 9 9C9 6.79 10.79 5 13 5M20 20.5C19.97 21.32 19.32 21.97 18.5 22H13C12.62 22 12.26 21.85 12 21.57L8 17.37L8.74 16.6C8.93 16.39 9.2 16.28 9.5 16.28H9.7L12 18V9C12 8.45 12.45 8 13 8S14 8.45 14 9V13.47L15.21 13.6L19.15 15.79C19.68 16.03 20 16.56 20 17.14V20.5M20 2H4C2.9 2 2 2.9 2 4V12C2 13.11 2.9 14 4 14H8V12L4 12L4 4H20L20 12H18V14H20V13.96L20.04 14C21.13 14 22 13.09 22 12V4C22 2.9 21.11 2 20 2Z";

interface BlueprintGroup {
  name: string;
  blueprints: Blueprint[];
}

@customElement("switch-manager-dialog-blueprint-selector")
export class SwitchManagerDialogBlueprintSelector extends LitElement {
  @state() private _params?: any;
  @state() private _blueprints: Blueprint[] = [];
  @state() private _filter = "";
  // Set once the user picked a device that has more than one protocol
  // available, so we can show the second ("choose protocol") step.
  @state() private _selectedGroupName?: string;
  private hass!: HomeAssistant;

  public showDialog(params: any) {
    this._params = params;
    this.hass = (this.parentElement as any)?.hass || (document.querySelector("home-assistant") as any)?.hass;
    this._loadBlueprints();
  }

  public closeDialog() {
    this._params = undefined;
    this._blueprints = [];
    this._filter = "";
    this._selectedGroupName = undefined;
  }

  private async _loadBlueprints() {
    const res = await this.hass.callWS<BlueprintsResponse>({
      type: wsType("blueprints"),
    });
    this._blueprints = Object.values(res.blueprints);
  }

  // Collapse blueprints that describe the same physical device (identical
  // `name`) into a single group, keeping every protocol variant available
  // under it (e.g. ZHA + Zigbee2MQTT for the same remote).
  private _groups(): BlueprintGroup[] {
    const map = new Map<string, Blueprint[]>();
    for (const bp of this._blueprints) {
      const list = map.get(bp.name);
      if (list) list.push(bp);
      else map.set(bp.name, [bp]);
    }
    return Array.from(map.entries())
      .map(([name, blueprints]) => ({
        name,
        blueprints: blueprints.sort((a, b) => a.service.localeCompare(b.service)),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  render() {
    if (!this._params) return html``;
    return this._selectedGroupName
      ? this._renderProtocolStep()
      : this._renderDeviceStep();
  }

  private _renderDeviceStep() {
    const filter = this._filter.toLowerCase();
    const groups = this._groups().filter(
      (g) =>
        !filter ||
        g.name.toLowerCase().includes(filter) ||
        g.blueprints.some((bp) => bp.service.toLowerCase().includes(filter))
    );

    return html`
      <switch-manager-dialog @closed=${this.closeDialog} heading="Select Blueprint">
        <input
          class="search"
          type="text"
          placeholder="Search"
          .value=${this._filter}
          @input=${(e: Event) =>
            (this._filter = (e.target as HTMLInputElement).value)}
        />
        <div class="blueprints">
          ${groups.map((group) => {
            const thumb =
              group.blueprints.find((bp) => bp.has_image) ?? group.blueprints[0];
            return html`
              <ha-card
                outlined
                class="blueprint-item"
                @click=${() => this._selectGroup(group)}
              >
                <div class="card-content">
                  ${this._renderThumb(thumb)}
                  <div class="info">
                    <div class="name">${group.name}</div>
                    <div class="protocols">
                      ${group.blueprints.map(
                        (bp) => html`<span class="protocol-badge">${bp.service}</span>`
                      )}
                    </div>
                  </div>
                </div>
              </ha-card>
            `;
          })}
        </div>
        <button slot="actions" @click=${this.closeDialog}>Cancel</button>
      </switch-manager-dialog>
    `;
  }

  private _renderProtocolStep() {
    const group = this._groups().find((g) => g.name === this._selectedGroupName);
    if (!group) {
      // Blueprints changed under us (e.g. reload) - fall back safely.
      this._selectedGroupName = undefined;
      return html``;
    }

    return html`
      <switch-manager-dialog @closed=${this.closeDialog} heading="Select Protocol">
        <div class="protocol-header">
          <button class="back" @click=${() => (this._selectedGroupName = undefined)}>
            ← Back
          </button>
          <div class="protocol-device-name">${group.name}</div>
        </div>
        <div class="blueprints">
          ${group.blueprints.map(
            (bp) => html`
              <ha-card
                outlined
                class="blueprint-item"
                @click=${() => this._selectBlueprint(bp)}
              >
                <div class="card-content">
                  ${this._renderThumb(bp)}
                  <div class="info">
                    <div class="name">${bp.service}</div>
                  </div>
                </div>
              </ha-card>
            `
          )}
        </div>
        <button slot="actions" @click=${this.closeDialog}>Cancel</button>
      </switch-manager-dialog>
    `;
  }

  private _renderThumb(bp: Blueprint) {
    return html`
      <div class="image">
        ${bp.has_image
          ? html`<img src="${assetUrl(bp.id + ".png")}" />`
          : html`<ha-svg-icon .path=${iconPath}></ha-svg-icon>`}
      </div>
    `;
  }

  private _selectGroup(group: BlueprintGroup) {
    if (group.blueprints.length === 1) {
      this._selectBlueprint(group.blueprints[0]);
    } else {
      this._selectedGroupName = group.name;
    }
  }

  private _selectBlueprint(bp: Blueprint) {
    this.closeDialog();
    navigate(navigateTo(`new/${bp.id}`));
  }

  static styles = css`
    .blueprints {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 8px;
      padding: 8px 0;
      max-height: 60vh;
      overflow-y: auto;
    }
    .blueprint-item {
      cursor: pointer;
    }
    .blueprint-item:hover {
      background: var(--secondary-background-color);
    }
    .card-content {
      text-align: center;
      padding: 8px;
    }
    .image {
      height: 80px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .image img {
      max-width: 100%;
      max-height: 80px;
    }
    .image ha-svg-icon {
      fill: var(--primary-color);
      width: 60px;
      height: 60px;
    }
    .name {
      font-weight: 500;
      margin-top: 8px;
    }
    .protocols {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 4px;
      margin-top: 4px;
    }
    .protocol-badge {
      color: var(--secondary-text-color);
      font-size: 0.75em;
      padding: 1px 6px;
      border-radius: 10px;
      border: 1px solid var(--divider-color, rgba(127, 127, 127, 0.3));
    }
    .protocol-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 8px;
    }
    .protocol-header .back {
      background: none;
      border: none;
      color: var(--primary-color);
      cursor: pointer;
      font: inherit;
      padding: 4px 0;
    }
    .protocol-device-name {
      font-weight: 500;
    }
    .search {
      display: block;
      width: 100%;
      box-sizing: border-box;
      margin-bottom: 8px;
      padding: 8px 12px;
      border: 1px solid var(--divider-color, rgba(127, 127, 127, 0.3));
      border-radius: 6px;
      background: var(--secondary-background-color, transparent);
      color: var(--primary-text-color);
      font: inherit;
    }
  `;
}
