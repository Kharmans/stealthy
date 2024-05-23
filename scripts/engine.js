import { Stealthy } from "./stealthy.js";
import Doors from "./doors.js";

export default class Engine {

  constructor() {
    // Hook the relevant skills to capture spot and hidden test
    // results into effects on the actor.

    // new implementations need to add something like the following
    // at file scope so that the Stealthy can find the engine during
    // setup

    // Hooks.once('init', () => {
    //   if (game.system.id === 'system-id') {
    //     const systemEngine = new system-engine();
    //     if (systemEngine) {
    //       window[Stealthy.MODULE_ID] = new Stealthy(systemEngine);
    //     }
    //   }
    // });


    this.warnedMissingCE = false;

    this.defaultDetectionModes = [
      'basicSight',
      'lightPerception',
      'seeAll',
      'seeInvisibility',
    ];

    Hooks.once('setup', () => {
      this.hiddenName = game.i18n.localize(game.settings.get(Stealthy.MODULE_ID, 'hiddenLabel'));
      this.spotName = game.i18n.localize(game.settings.get(Stealthy.MODULE_ID, 'spotLabel'));
      Stealthy.log(`hiddenName='${this.hiddenName}', spotName='${this.spotName}'`);
      if (game.settings.get(Stealthy.MODULE_ID, 'spotSecretDoors')) {
        Doors.initialize();
      }
    });
  }

  mixInDefaults(settings) {
    let changed = false;
    for (const mode in CONFIG.Canvas.detectionModes) {
      if (!(mode in settings)) {
        settings[mode] = this.defaultDetectionModes.includes(mode);
        changed = true;
      }
    }
    return changed;
  }

  patchFoundry() {
    let allowedModes = game.settings.get(Stealthy.MODULE_ID, 'allowedDetectionModes');
    const changed = this.mixInDefaults(allowedModes);
    if (changed) {
      Hooks.once('ready', () => {
        Stealthy.log('Allowed modes settings update', allowedModes);
        game.settings.set(Stealthy.MODULE_ID, 'allowedDetectionModes', allowedModes);
      });
    }

    for (const mode in allowedModes) {
      if (!allowedModes[mode]) continue;
      if (!(mode in CONFIG.Canvas.detectionModes)) continue;

      Stealthy.log(`patching ${mode}`);
      libWrapper.register(
        Stealthy.MODULE_ID,
        `CONFIG.Canvas.detectionModes.${mode}._canDetect`,
        function (wrapped, visionSource, target) {
          if (!(wrapped(visionSource, target))) return false;
          const engine = stealthy.engine;
          if (target instanceof DoorControl)
            return engine.canSpotDoor(target, visionSource);
          const tgtToken = target?.document;
          if (tgtToken instanceof TokenDocument)
            return engine.checkDispositionAndCanDetect(visionSource, tgtToken, mode);
          return true;
        },
        libWrapper.MIXED,
        { perf_mode: libWrapper.PERF_FAST }
      );
    }
  }

  // deprecated
  isHidden(visionSource, tgtToken, detectionMode = undefined) {
    return false;
  }

  checkDispositionAndCanDetect(visionSource, tgtToken, detectionMode) {
    // Early out for buddies
    if (tgtToken?.disposition === visionSource.object.document?.disposition) {
      const friendlyStealth = game.settings.get(Stealthy.MODULE_ID, 'friendlyStealth');
      if (friendlyStealth === 'ignore' || !game.combat && friendlyStealth === 'inCombat') return true;
    }

    // Gotta have a stealth flag or we see you
    const stealthFlag = this.getStealthFlag(tgtToken);
    if (!stealthFlag) return true;

    // Otherwise, grab our flags/values and let the system decide
    const perceptionFlag = this.getPerceptionFlag(visionSource.object);
    return this.canDetect({
      visionSource,
      tgtToken,
      detectionMode,
      stealthFlag,
      stealthValue: this.getStealthValue(stealthFlag),
      perceptionFlag,
      perceptionValue: this.getPerceptionValue(perceptionFlag)
    });
  }

  canDetect({ stealthValue, perceptionValue }) {
    return perceptionValue > stealthValue;
  }

  async setValueInEffect(flag, skill, value, sourceEffect) {
    const token = flag.token;
    let effect = duplicate(sourceEffect);
    if (!('stealthy' in effect.flags))
      effect.flags.stealthy = {};
    effect.flags.stealthy[skill] = value;
    const actor = token.actor;
    await actor.updateEmbeddedDocuments('ActiveEffect', [effect]);
  }

  async setValue(skill, flag, value) {
    Stealthy.log('setValue', { skill, flag, value });
    const token = flag.token;
    const sourceEffect = flag?.effect;

    // If there is an effect, stuff the flag in it
    if (sourceEffect) {
      await this.setValueInEffect(flag, skill, value, sourceEffect);
    }

    // Otherwise, if we are token based then we need to update the token value
    else if (!stealthy[`${skill}ToActor`]) {
      let update = { _id: token.id, };
      if (value === undefined) {
        update[`flags.stealthy.-=${skill}`] = true;
      } else {
        update[`flags.stealthy.${skill}`] = value;
      }
      await canvas.scene.updateEmbeddedDocuments("Token", [update]);
    }
  }

  async bankRollOnToken(tokenOrActor, skill, value) {
    Stealthy.log('bankRollOnToken', { tokenOrActor, skill, value });
    let token = tokenOrActor;
    if (token instanceof Actor) {
      token = canvas.tokens.controlled.find((t) => t.actor === tokenOrActor);
      if (!token) return;
    }
    let update = { _id: token.id, };
    update[`flags.stealthy.${skill}`] = value;
    await canvas.scene.updateEmbeddedDocuments("Token", [update]);
  }

  getStealthFlag(token) {
    let flags = undefined;
    const actor = token?.actor;
    const effect = this.findHiddenEffect(actor);
    if (effect) {
      flags = effect?.flags?.stealthy;
    }
    else {
      const tokenDoc = token instanceof Token ? token.document : token;
      flags = tokenDoc.flags?.stealthy;
      if (!flags || !('stealth' in flags)) return undefined;
    }
    const stealth = flags?.stealth ?? flags?.hidden;
    return { stealth, effect, token };
  }

  getPerceptionFlag(token) {
    let flags = undefined;
    const actor = token?.actor;
    const effect = this.findSpotEffect(actor);
    if (effect) {
      flags = effect?.flags?.stealthy;
    }
    else {
      const tokenDoc = token instanceof Token ? token.document : token;
      flags = tokenDoc.flags?.stealthy;
      if (!flags || !('perception' in flags)) return undefined;
    }
    const perception = flags?.perception ?? flags?.spot;
    return { perception, effect, token };
  }

  getStealthValue(flag) {
    return flag?.stealth;
  }

  getPerceptionValue(flag) {
    return flag?.perception;
  }

  async setStealthValue(flag, value) {
    await this.setValue('stealth', flag, value);
    stealthy.socket.executeForEveryone('RefreshPerception');
  }

  async setPerceptionValue(flag, value) {
    await this.setValue('perception', flag, value);
    canvas.perception.update({ initializeVision: true }, true);
  }

  async bankStealth(token, value) {
    if (stealthy.stealthToActor) {
      await this.updateOrCreateHiddenEffect(token.actor, { stealth: value });
    } else {
      await this.bankRollOnToken(token, 'stealth', value);
    }
  }

  async bankPerception(token, value) {
    if (stealthy.perceptionToActor) {
      await this.updateOrCreateSpotEffect(token.actor, { perception: value });
    } else {
      await this.bankRollOnToken(token, 'perception', value);
    }
  }

  rollStealth() {
    stealthy.socket.executeForEveryone('RefreshPerception');
  }

  rollPerception() {
    canvas.perception.update({ initializeVision: true }, true);
  }

  findHiddenEffect(actor) {
    const v10 = Math.floor(game.version) < 11;
    return actor?.effects.find((e) => !e.disabled && this.hiddenName === (v10 ? e.label : e.name));
  }

  findSpotEffect(actor) {
    const v10 = Math.floor(game.version) < 11;
    return actor?.effects.find((e) => !e.disabled && this.spotName === (v10 ? e.label : e.name));
  }

  makeHiddenEffectMaker(name) {
    return (flag, source) => {
      let effect = {
        icon: game.settings.get(Stealthy.MODULE_ID, 'hiddenIcon'),
        description: game.i18n.localize("stealthy.hidden.description"),
        flags: {
          stealthy: flag,
        },
        statuses: ['hidden'],
        changes: [],
      };
      effect[(Math.floor(game.version) < 11) ? 'label' : 'name'] = name;

      if (source === 'ae') {
        if (typeof ATLUpdate !== 'undefined') {
          effect.changes.push({
            key: 'ATL.alpha',
            mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE,
            value: '0.75'
          });
        }
      }
      return effect;
    };
  }

  makeSpotEffectMaker(name) {
    return (flag, source) => {
      let effect = {
        icon: game.settings.get(Stealthy.MODULE_ID, 'spotIcon'),
        description: game.i18n.localize("stealthy.spot.description"),
        flags: {
          stealthy: flag,
        },
        statuses: ['spot'],
      };
      effect[(Math.floor(game.version) < 11) ? 'label' : 'name'] = name;

      return effect;
    };
  }

  async updateOrCreateEffect({ name, actor, flag, source, makeEffect }) {
    const v10 = Math.floor(game.version) < 11;
    let effect = actor.effects.find((e) => name === (v10 ? e.label : e.name));

    if (!effect) {
      // See if we can source from outside
      if (source === 'ce') {
        if (game.dfreds?.effectInterface?.findEffectByName(name)) {
          await game.dfreds.effectInterface.addEffect({ effectName: name, uuid: actor.uuid });
          effect = actor.effects.find((e) => name === (v10 ? e.label : e.name));
        }
        if (!effect && !this.warnedMissingCE) {
          this.warnedMissingCE = true;
          if (game.user.isGM)
            ui.notifications.warn(
              `${game.i18n.localize('stealthy.source.ce.beforeLabel')} '${name}' ${game.i18n.localize('stealthy.source.ce.afterLabel')}`);
          console.error(`stealthy | Convenient Effects couldn't find the '${name}' effect so Stealthy will use the default one. Add your customized effect to CE or select a different effect source in Game Settings`);
        }
      }

      // If we haven't found an ouside source, create the default one
      if (!effect) {
        effect = makeEffect(flag, source);
        await actor.createEmbeddedDocuments('ActiveEffect', [effect]);
        return;
      }
    }

    effect = duplicate(effect);
    effect.flags.stealthy = flag;
    effect.disabled = false;
    await actor.updateEmbeddedDocuments('ActiveEffect', [effect]);
  }

  async updateOrCreateHiddenEffect(actor, flag) {
    await this.updateOrCreateEffect({
      name: this.hiddenName,
      actor,
      flag,
      source: game.settings.get(Stealthy.MODULE_ID, 'hiddenSource'),
      makeEffect: this.makeHiddenEffectMaker(this.hiddenName)
    });
    stealthy.socket.executeForEveryone('RefreshPerception');
  }

  async updateOrCreateSpotEffect(actor, flag) {
    await this.updateOrCreateEffect({
      name: this.spotName,
      actor,
      flag,
      source: game.settings.get(Stealthy.MODULE_ID, 'spotSource'),
      makeEffect: this.makeSpotEffectMaker(this.spotName)
    });
    canvas.perception.update({ initializeVision: true }, true);
  }

  getLightExposure(token) {
    token = token instanceof Token ? token : token.object;

    const scene = token.scene;
    if (scene !== canvas.scene || !scene.tokenVision) return undefined;

    let exposure = 'dark';
    const center = token.center;

    for (const light of canvas.effects.lightSources) {
      if (!light.active) continue;

      const bright = light.data.bright;
      const dim = light.data.dim;

      if (light.object === token) {
        if (bright) return 'bright';
        if (dim) exposure = 'dim';
        continue;
      }

      if (!light.shape.contains(center.x, center.y)) continue;

      if (light.ratio === 1) return 'bright';
      if (light.ratio === 0) {
        exposure = 'dim';
        continue;
      }

      const distance = new Ray(light, center).distance;
      if (distance <= bright) return 'bright';
      exposure = 'dim';
    }

    return exposure;
  }

  canSpotDoor(doorControl, visionSource) {
    // Open doors are visible
    const door = doorControl.wall.document;
    if (door.ds == 1) return true;

    // Unhidden doors are visible
    const stealthyFlags = door.flags?.stealthy;
    if (!stealthyFlags) return true;

    // Hidden doors can only be spotted if they are in range
    const maxRange = stealthyFlags?.maxRange ?? Infinity;
    const ray = new Ray(doorControl.center, visionSource.object.center);
    const distance = canvas.grid.measureDistances([{ ray }])[0];
    if (distance > maxRange) return false;

    // Now just compare the perception and the door's stealth
    const stealthValue = stealthyFlags.stealth;
    const perceptionFlag = this.getPerceptionFlag(visionSource.object.document);
    const perceptionValue = this.getPerceptionValue(perceptionFlag);
    return perceptionValue >= stealthValue;
  }
}

