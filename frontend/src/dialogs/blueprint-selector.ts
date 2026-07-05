import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import type { HomeAssistant, Blueprint, BlueprintsResponse } from "../types";
import { wsType, navigateTo, navigate, assetUrl } from "../helpers";
import "../switch-manager-dialog";

const iconPath =
  "M13 5C15.21 5 17 6.79 17 9C17 10.5 16.2 11.77 15 12.46V11.24C15.61 10.69 16 9.89 16 9C16 7.34 14.66 6 13 6S10 7.34 10 9C10 9.89 10.39 10.69 11 11.24V12.46C9.8 11.77 9 10.5 9 9C9 6.79 10.79 5 13 5M20 20.5C19.97 21.32 19.32 21.97 18.5 22H13C12.62 22 12.26 21.85 12 21.57L8 17.37L8.74 16.6C8.93 16.39 9.2 16.28 9.5 16.28H9.7L12 18V9C12 8.45 12.45 8 13 8S14 8.45 14 9V13.47L15.21 13.6L19.15 15.79C19.68 16.03 20 16.56 20 17.14V20.5M20 2H4C2.9 2 2 2.9 2 4V12C2 13.11 2.9 14 4 14H8V12L4 12L4 4H20L20 12H18V14H20V13.96L20.04 14C21.13 14 22 13.09 22 12V4C22 2.9 21.11 2 20 2Z";

// The picker is a 4-level cascade, each level only shown when there's an
// actual choice to make (auto-skipped otherwise):
//
//   DeviceFamily  (device_group, falls back to name)
//     -> DeviceVariant  (name - a hardware/brand variant of the family,
//                         e.g. "standard" vs. "E1", or "TuYa" vs. "Moes/Zignito")
//         -> ServiceGroup  (service - the integration/protocol, e.g. ZHA)
//             -> OperatingMode  (variant - same device+protocol, different
//                                 behaviour, e.g. Shelly as button vs. switch)

interface DeviceFamily {
  key: string;
  blueprints: Blueprint[];
}

interface DeviceVariant {
  name: string;
  blueprints: Blueprint[];
}

interface ServiceGroup {
  service: string;
  blueprints: Blueprint[];
}

@customElement("switch-manager-dialog-blueprint-selector")
export class SwitchManagerDialogBlueprintSelector extends LitElement {
  @state() private _params?: any;
  @state() private _blueprints: Blueprint[] = [];
  @state() private _filter = "";
  @state() private _selectedFamilyKey?: string;
  @state() private _selectedVariantName?: string;
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
    this._selectedFamilyKey = undefined;
    this._selectedVariantName = undefined;
    this._selectedService = undefined;
  }

  private async _loadBlueprints() {
    const res = await this.hass.callWS<BlueprintsResponse>({
      type: wsType("blueprints"),
    });
    this._blueprints = Object.values(res.blueprints);
  }

  private _familyKey(bp: Blueprint): string {
    return bp.device_group || bp.name;
  }

  private _families(): DeviceFamily[] {
    const map = new Map<string, Blueprint[]>();
    for (const bp of this._blueprints) {
      const key = this._familyKey(bp);
      const list = map.get(key);
      if (list) list.push(bp);
      else map.set(key, [bp]);
    }
    return Array.from(map.entries())
      .map(([key, blueprints]) => ({ key, blueprints }))
      .sort((a, b) => a.key.localeCompare(b.key));
  }

  private _variants(family: { blueprints: Blueprint[] }): DeviceVariant[] {
    const map = new Map<string, Blueprint[]>();
    for (const bp of family.blueprints) {
      const key = bp.device_variant || bp.name;
      const list = map.get(key);
      if (list) list.push(bp);
      else map.set(key, [bp]);
    }
    return Array.from(map.entries())
      .map(([name, blueprints]) => ({
        name,
        blueprints: blueprints.sort((a, b) => a.service.localeCompare(b.service)),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  private _serviceGroups(variant: { blueprints: Blueprint[] }): ServiceGroup[] {
    const map = new Map<string, Blueprint[]>();
    for (const bp of variant.blueprints) {
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

  // Distinct, meaningful operating-mode labels within a service group.
  // Pure duplicate blueprints (same device+protocol, no `variant` set,
  // e.g. leftover whitelabel copies) don't count as a real choice.
  private _distinctModes(serviceGroup: ServiceGroup): string[] {
    return Array.from(
      new Set(serviceGroup.blueprints.map((bp) => bp.variant).filter((v): v is string => !!v))
    );
  }

  private _brands(blueprints: Blueprint[]): string[] {
    return Array.from(new Set(blueprints.map((bp) => bp.brand).filter((b): b is string => !!b)));
  }

  render() {
    if (!this._params) return html``;
    if (this._selectedService) return this._renderModeStep();
    if (this._selectedVariantName) return this._renderProtocolStep();
    if (this._selectedFamilyKey) return this._renderVariantStep();
    return this._renderDeviceStep();
  }

  private _renderDeviceStep() {
    const filter = this._filter.toLowerCase();
    const families = this._families().filter(
      (f) =>
        !filter ||
        f.key.toLowerCase().includes(filter) ||
        f.blueprints.some(
          (bp) =>
            bp.name.toLowerCase().includes(filter) ||
            bp.service.toLowerCase().includes(filter) ||
            bp.brand?.toLowerCase().includes(filter)
        )
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
          ${families.map((family) => {
            const thumb =
              family.blueprints.find((bp) => bp.has_image) ?? family.blueprints[0];
            const serviceGroups = this._serviceGroups(family);
            const brands = this._brands(family.blueprints);
            return html`
              <ha-card
                outlined
                class="blueprint-item"
                @click=${() => this._selectFamily(family)}
              >
                <div class="card-content">
                  ${this._renderThumb(thumb, brands)}
                  <div class="info">
                    <div class="name">${family.key}</div>
                    <div class="protocols">
                      ${serviceGroups.map(
                        (sg) => html`
                          <span class="protocol-badge">
                            ${sg.service}
                            ${this._distinctModes(sg).length > 1
                              ? html`<span class="variant-count"
                                  >${this._distinctModes(sg).length}</span
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

  private _renderVariantStep() {
    const family = this._families().find((f) => f.key === this._selectedFamilyKey);
    if (!family) {
      this._selectedFamilyKey = undefined;
      return html``;
    }
    const variants = this._variants(family);

    return html`
      <switch-manager-dialog @closed=${this.closeDialog} heading="Select Variant">
        <div class="protocol-header">
          <button class="back" @click=${() => (this._selectedFamilyKey = undefined)}>
            ← Back
          </button>
          <div class="protocol-device-name">${family.key}</div>
        </div>
        <div class="blueprints">
          ${variants.map((variant) => {
            const thumb =
              variant.blueprints.find((bp) => bp.has_image) ?? variant.blueprints[0];
            const serviceGroups = this._serviceGroups(variant);
            const brands = this._brands(variant.blueprints);
            return html`
              <ha-card
                outlined
                class="blueprint-item"
                @click=${() => this._selectVariant(variant)}
              >
                <div class="card-content">
                  ${this._renderThumb(thumb, brands)}
                  <div class="info">
                    <div class="name">${variant.name}</div>
                    <div class="protocols">
                      ${serviceGroups.map(
                        (sg) => html`
                          <span class="protocol-badge">
                            ${sg.service}
                            ${this._distinctModes(sg).length > 1
                              ? html`<span class="variant-count"
                                  >${this._distinctModes(sg).length}</span
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
    const family = this._families().find((f) => f.key === this._selectedFamilyKey);
    const variant = family
      ? this._variants(family).find((v) => v.name === this._selectedVariantName)
      : undefined;
    if (!family || !variant) {
      this._selectedFamilyKey = undefined;
      this._selectedVariantName = undefined;
      return html``;
    }
    const serviceGroups = this._serviceGroups(variant);
    // Was the variant step actually shown on the way in?
    const cameFromVariantStep = this._variants(family).length > 1;

    return html`
      <switch-manager-dialog @closed=${this.closeDialog} heading="Select Protocol">
        <div class="protocol-header">
          <button
            class="back"
            @click=${() => {
              this._selectedVariantName = undefined;
              if (!cameFromVariantStep) this._selectedFamilyKey = undefined;
            }}
          >
            ← Back
          </button>
          <div class="protocol-device-name">
            ${family.key}${cameFromVariantStep ? html` · ${variant.name}` : ""}
          </div>
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
                  ${this._renderThumb(sg.blueprints[0], this._brands(sg.blueprints))}
                  <div class="info">
                    <div class="name">${sg.service}</div>
                    ${this._distinctModes(sg).length > 1
                      ? html`<div class="protocols">
                          ${this._distinctModes(sg).map(
                            (m) => html`<span class="variant-badge">${m}</span>`
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

  private _renderModeStep() {
    const family = this._families().find((f) => f.key === this._selectedFamilyKey);
    const variant = family
      ? this._variants(family).find((v) => v.name === this._selectedVariantName)
      : undefined;
    const serviceGroup = variant
      ? this._serviceGroups(variant).find((sg) => sg.service === this._selectedService)
      : undefined;

    if (!family || !variant || !serviceGroup) {
      this._selectedFamilyKey = undefined;
      this._selectedVariantName = undefined;
      this._selectedService = undefined;
      return html``;
    }

    const cameFromProtocolStep = this._serviceGroups(variant).length > 1;
    const cameFromVariantStep = this._variants(family).length > 1;

    return html`
      <switch-manager-dialog @closed=${this.closeDialog} heading="Select Mode">
        <div class="protocol-header">
          <button
            class="back"
            @click=${() => {
              this._selectedService = undefined;
              if (!cameFromProtocolStep) {
                this._selectedVariantName = undefined;
                if (!cameFromVariantStep) this._selectedFamilyKey = undefined;
              }
            }}
          >
            ← Back
          </button>
          <div class="protocol-device-name">
            ${family.key}${cameFromVariantStep ? html` · ${variant.name}` : ""}${cameFromProtocolStep
              ? html` · ${serviceGroup.service}`
              : ""}
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
                  ${this._renderThumb(bp, bp.brand ? [bp.brand] : [])}
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

  private _renderThumb(bp: Blueprint, brands: string[] = []) {
    return html`
      <div class="image">
        ${bp.has_image
          ? html`<img src="${assetUrl(bp.id + ".png")}" />`
          : html`<ha-svg-icon .path=${iconPath}></ha-svg-icon>`}
        ${brands.length
          ? html`<div class="brand-badges">
              ${brands.map((b) => html`<span class="brand-badge">${b}</span>`)}
            </div>`
          : ""}
      </div>
    `;
  }

  private _selectFamily(family: DeviceFamily) {
    if (family.blueprints.length === 1) {
      this._selectBlueprint(family.blueprints[0]);
      return;
    }
    const variants = this._variants(family);
    if (variants.length === 1) {
      this._selectedFamilyKey = family.key;
      this._selectVariant(variants[0]);
      return;
    }
    this._selectedFamilyKey = family.key;
  }

  private _selectVariant(variant: DeviceVariant) {
    if (variant.blueprints.length === 1) {
      this._selectBlueprint(variant.blueprints[0]);
      return;
    }
    const serviceGroups = this._serviceGroups(variant);
    if (serviceGroups.length === 1) {
      this._selectedVariantName = variant.name;
      this._selectServiceGroup(serviceGroups[0]);
      return;
    }
    this._selectedVariantName = variant.name;
  }

  private _selectServiceGroup(serviceGroup: ServiceGroup) {
    if (serviceGroup.blueprints.length === 1) {
      this._selectBlueprint(serviceGroup.blueprints[0]);
      return;
    }
    if (this._distinctModes(serviceGroup).length <= 1) {
      // No meaningful choice (e.g. leftover duplicate whitelabel
      // blueprints with no distinct operating mode) - just proceed with
      // one of them, they're functionally identical.
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
      position: relative;
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
    .brand-badges {
      position: absolute;
      top: 2px;
      left: 2px;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 2px;
    }
    .brand-badge {
      background: var(--primary-color);
      color: var(--text-primary-color, #fff);
      font-size: 0.65em;
      font-weight: 500;
      padding: 1px 5px;
      border-radius: 4px;
      line-height: 1.4;
      white-space: nowrap;
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
