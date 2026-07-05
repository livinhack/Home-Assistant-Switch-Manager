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

// All blueprints for one device that share the same `service` (protocol).
// If this contains more than one blueprint, they're not different
// hardware/protocols - they're different operating modes of the SAME
// device+protocol combo (e.g. a Shelly used as a button vs. as a relay
// switch), distinguished by `variant`.
interface ServiceGroup {
  service: string;
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
  // Set once the user picked (or we auto-picked) a protocol that has more
  // than one variant, so we can show the third ("choose variant") step.
  @state() private _selectedService?: string;
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
    this._selectedService = undefined;
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

  // Within a device group, collapse blueprints further by `service`. A
  // service group with more than one blueprint means: same device, same
  // protocol, but multiple operating-mode variants to choose from.
  private _serviceGroups(group: BlueprintGroup): ServiceGroup[] {
    const map = new Map<string, Blueprint[]>();
    for (const bp of group.blueprints) {
      const list = map.get(bp.service);
      if (list) list.push(bp);
      else map.set(bp.service, [bp]);
    }
    return Array.from(map.entries())
      .map(([service, blueprints]) => ({
        service,
        blueprints: blueprints.sort((a, b) =>
          (a.variant ?? "").localeCompare(b.variant ?? "")
        ),
      }))
      .sort((a, b) => a.service.localeCompare(b.service));
  }

  render() {
    if (!this._params) return html``;
    if (this._selectedService) return this._renderVariantStep();
    if (this._selectedGroupName) return this._renderProtocolStep();
    return this._renderDeviceStep();
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
            const serviceGroups = this._serviceGroups(group);
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
                      ${serviceGroups.map(
                        (sg) => html`
                          <span class="protocol-badge">
                            ${sg.service}
                            ${sg.blueprints.length > 1
                              ? html`<span class="variant-count"
                                  >${sg.blueprints.length}</span
                                >`
                              : ""}
                          </span>
                        `
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
    const serviceGroups = this._serviceGroups(group);

    return html`
      <switch-manager-dialog @closed=${this.closeDialog} heading="Select Protocol">
        <div class="protocol-header">
          <button class="back" @click=${() => (this._selectedGroupName = undefined)}>
            ← Back
          </button>
          <div class="protocol-device-name">${group.name}</div>
        </div>
        <div class="blueprints">
          ${serviceGroups.map(
            (sg) => html`
              <ha-card
                outlined
                class="blueprint-item"
                @click=${() => this._selectServiceGroup(sg)}
              >
                <div class="card-content">
                  ${this._renderThumb(sg.blueprints[0])}
                  <div class="info">
                    <div class="name">${sg.service}</div>
                    ${sg.blueprints.length > 1
                      ? html`<div class="protocols">
                          ${sg.blueprints.map(
                            (bp) =>
                              html`<span class="variant-badge"
                                >${bp.variant}</span
                              >`
                          )}
                        </div>`
                      : ""}
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

  private _renderVariantStep() {
    const group = this._groups().find((g) => g.name === this._selectedGroupName);
    const serviceGroup = group
      ?.blueprints // rebuild from the live group rather than trusting stale references
      ? this._serviceGroups(group).find((sg) => sg.service === this._selectedService)
      : undefined;

    if (!group || !serviceGroup) {
      // Blueprints changed under us (e.g. reload) - fall back safely.
      this._selectedGroupName = undefined;
      this._selectedService = undefined;
      return html``;
    }

    // If the device only has this one protocol, the protocol step was
    // skipped on the way in, so "Back" should return to the device step
    // instead of a protocol step the user never saw.
    const cameFromProtocolStep = this._serviceGroups(group).length > 1;

    return html`
      <switch-manager-dialog @closed=${this.closeDialog} heading="Select Mode">
        <div class="protocol-header">
          <button
            class="back"
            @click=${() => {
              this._selectedService = undefined;
              if (!cameFromProtocolStep) this._selectedGroupName = undefined;
            }}
          >
            ← Back
          </button>
          <div class="protocol-device-name">
            ${group.name}${cameFromProtocolStep ? html` · ${serviceGroup.service}` : ""}
          </div>
        </div>
        <div class="blueprints">
          ${serviceGroup.blueprints.map(
            (bp) => html`
              <ha-card
                outlined
                class="blueprint-item"
                @click=${() => this._selectBlueprint(bp)}
              >
                <div class="card-content">
                  ${this._renderThumb(bp)}
                  <div class="info">
                    <div class="name">${bp.variant ?? bp.service}</div>
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
      return;
    }
    const serviceGroups = this._serviceGroups(group);
    if (serviceGroups.length === 1) {
      // Only one protocol - skip straight to the variant step.
      this._selectedGroupName = group.name;
      this._selectServiceGroup(serviceGroups[0]);
      return;
    }
    this._selectedGroupName = group.name;
  }

  private _selectServiceGroup(serviceGroup: ServiceGroup) {
    if (serviceGroup.blueprints.length === 1) {
      this._selectBlueprint(serviceGroup.blueprints[0]);
      return;
    }
    this._selectedService = serviceGroup.service;
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
      display: inline-flex;
      align-items: center;
      gap: 4px;
      color: var(--secondary-text-color);
      font-size: 0.75em;
      padding: 1px 6px;
      border-radius: 10px;
      border: 1px solid var(--divider-color, rgba(127, 127, 127, 0.3));
    }
    .variant-badge {
      color: var(--secondary-text-color);
      font-size: 0.75em;
      padding: 1px 6px;
      border-radius: 10px;
      background: var(--secondary-background-color, rgba(127, 127, 127, 0.15));
    }
    .variant-count {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 14px;
      height: 14px;
      padding: 0 4px;
      border-radius: 999px;
      background: var(--primary-color);
      color: var(--text-primary-color, #fff);
      font-size: 0.7em;
      line-height: 14px;
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
