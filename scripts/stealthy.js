export class Stealthy {

  static MODULE_ID = 'stealthy';

  constructor(engine) {
    this.engine = engine;
    this.socket = null;
    this.engine.patchFoundry();
    Hooks.once('setup', () => {
      this.socket = socketlib.registerModule(Stealthy.MODULE_ID);
      this.socket.register('TogglePerceptionBanking', Stealthy.TogglePerceptionBanking);
      this.socket.register('GetPerceptionBanking', Stealthy.GetPerceptionBanking);
      this.socket.register('RefreshPerception', Stealthy.RefreshPerception);
    });
  }

  static async TogglePerceptionBanking(toggled) {
    Stealthy.log(`ToggletPerceptionBanking <= ${toggled}`);
    stealthy.bankingPerception = toggled;
    if (toggled || !game.user.isGM)
      return;

    const v10 = Math.floor(game.version) < 11;
    const name = game.i18n.localize('stealthy.spot.name');
    let updates = [];
    for (let token of canvas.tokens.placeables) {
      const actor = token.actor;
      const spot = actor.effects.find((e) => name === (v10 ? e.label : e.name));
      if (spot) {
        actor.deleteEmbeddedDocuments('ActiveEffect', [spot.id]);
      }
      const tokenDoc = (token instanceof Token) ? token.document : token;
      if (tokenDoc.flags?.stealthy?.perception) {
        let update = { _id: token.id, };
        update['flags.stealthy.-=perception'] = true;
        updates.push(update);
      }
    }
    if (updates.length > 0)
      await canvas.scene.updateEmbeddedDocuments("Token", updates);
  }

  static RefreshPerception() {
    Stealthy.log(`RefreshPerception`);
    canvas.perception.update({ initializeVision: true }, true);
  }

  static async GetPerceptionBanking() {
    Stealthy.log(`GetPerceptionBanking => ${stealthy.bankingPerception}`);
    return stealthy.bankingPerception;
  }

  static CONSOLE_COLORS = ['background: #222; color: #80ffff', 'color: #fff'];
  static engines = {};

  static colorizeOutput(format, ...args) {
    return [
      `%cstealthy %c|`,
      ...Stealthy.CONSOLE_COLORS,
      format,
      ...args,
    ];
  }

  static log(format, ...args) {
    const level = game.settings.get(Stealthy.MODULE_ID, 'logLevel');
    if (level !== 'none') {

      if (level === 'debug')
        console.debug(...Stealthy.colorizeOutput(format, ...args));
      else if (level === 'log')
        console.log(...Stealthy.colorizeOutput(format, ...args));
    }
  }

  static logIfDebug(format, ...args) {
    const level = game.settings.get(Stealthy.MODULE_ID, 'logLevel');
    if (level === 'debug') {

      console.debug(...Stealthy.colorizeOutput(format, ...args));
    }
  }

}
