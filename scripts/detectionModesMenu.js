import { Stealthy } from "./stealthy.js";

export class DetectionModesApplicationClass extends FormApplication {
  constructor(object, options = {}) {
    super(object, options);
  }
  get #detectionModes() {
    return foundry.utils
      .deepClone(game.settings.get(Stealthy.MODULE_ID, Stealthy.ALLOWED_DETECTION_MODES));
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      title: "stealthy.detectionModesMenu.label",
      id: "stealthy-allowed-detection-modes",
      template: "modules/stealthy/templates/detectionModes.hbs",
      popOut: true,
      width: "auto",
      height: "auto",
      closeOnSubmit: true,
      submitOnClose: false,
      submitOnChange: false,
    });
  }

  getData() {
    const context = super.getData();
    const entries = Object.entries(this.#detectionModes)
      .filter(([k, v]) => k in CONFIG.Canvas.detectionModes && k !== 'undefined')
      .map(([k, v]) => [k, {
        label: CONFIG.Canvas.detectionModes[k].label,
        ...v,
      }])
      .sort((a, b) => game.i18n.localize(a[1].label).localeCompare(game.i18n.localize(b[1].label)));
    context.detectionModes = Object.fromEntries(entries);
    if ('lightBased' in entries[0][1])
      context.lightBased = true;
    return context;
  }

  _updateObject(event, formData) {
    const original = game.settings.get(Stealthy.MODULE_ID, Stealthy.ALLOWED_DETECTION_MODES);
    let modes = {};
    for (const [key, value] of Object.entries(formData)) {
      const [mode, property] = key.split('-');
      if (!(mode in modes)) modes[mode] = {};
      modes[mode][property] = value;
    }

    if (JSON.stringify(formData) !== JSON.stringify(original)) {
      ui.notifications.warn(game.i18n.localize("stealthy.detectionModesMenu.warning"));
      Stealthy.log('new setting', modes);
      game.settings.set(Stealthy.MODULE_ID, Stealthy.ALLOWED_DETECTION_MODES, modes);
    }
  }
}

