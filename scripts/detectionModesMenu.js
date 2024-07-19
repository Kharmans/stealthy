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
      .sort();
    context.detectionModes = Object.fromEntries(entries);
    if ('lightBased' in entries[0][1])
      context.lightBased = true;
    return context;
  }

  _updateObject(event, formData) {
    Stealthy.log('_updateObject', { event, formData });
    const original = game.settings.get(Stealthy.MODULE_ID, Stealthy.ALLOWED_DETECTION_MODES);
    let modes = {};
    for (let [key, value] of Object.entries(formData)) {
      const bits = key.split('-');
      key = bits[1];
      if (!(key in modes)) modes[key] = {};
      modes[key][bits[2]] = value;
    }
    Stealthy.log('new modes', modes);

    if (false && JSON.stringify(formData) !== JSON.stringify(original)) {
      ui.notifications.warn(game.i18n.localize("stealthy.detectionModesMenu.warning"));
      game.settings.set(Stealthy.MODULE_ID, Stealthy.ALLOWED_DETECTION_MODES, modes);
    }
  }
}

