'use strict';

var libQ = require('kew');
var fs = require('fs-extra');
var config = require('v-conf');
var i2cOld = require('i2c-bus');
var i2c = require('i2c');

module.exports = ControllerES9018K2M;

function ControllerES9018K2M(context) {
	var self = this;

  self.context = context;
  self.commandRouter = this.context.coreCommand;
  self.logger = this.context.logger;
  self.configManager = this.context.configManager;
  self.logger.info("ControllerES9018K2M::constructor");
}

ControllerES9018K2M.prototype.onVolumioStart = function()
{
  var self = this;

  this.configFile = this
      .commandRouter
      .pluginManager
      .getConfigurationFile(this.context,'config.json');
  self.getConf(this.configFile);

  return libQ.resolve();
};

ControllerES9018K2M.prototype.getConfigurationFiles = function () {
  return ['config.json'];
};

ControllerES9018K2M.prototype.onStart = function() {
  var self = this;
  
  self.loadI18nStrings();
  self.initVariables();
  self.initRegister();
  self.execDeviceCheckControl();
  self.loadConfig();

  self.serviceName = self.getI18nString('PLUGIN_NAME');

  if (self.es9018k2m) {
    self.loadDefaultValue();
    self.commandRouter.pushToastMessage('info', self.serviceName, "start es9018k2m");
  }

  return libQ.resolve();
};

ControllerES9018K2M.prototype.onStop = function() {
  var self = this;

  return libQ.resolve();
};

ControllerES9018K2M.prototype.onRestart = function() {
  var self = this;

  return libQ.resolve();
};

// Configuration Methods -----------------------------------------------------
ControllerES9018K2M.prototype.getConf = function(configFile) {
  var self = this;

  self.config = new (require('v-conf'))();
  self.config.loadFile(configFile);
};

ControllerES9018K2M.prototype.setConf = function(varName, varValue) {
  var self = this;

  //Perform your installation tasks here
};

ControllerES9018K2M.prototype.setUIConfig = function(data) {
  var self = this;

  self.logger.info("ES9018K2M:setUIConfig");
  var uiconf = fs.readJsonSync(__dirname + '/UIConfig.json');

  return libQ.resolve();
};

ControllerES9018K2M.prototype.loadConfig = function() {
  var self = this;

  self.volumeLevel = self.config.get("volumeLevel");
  self.balance = self.config.get('balance');
  self.balanceNote = self.config.get('balanceNote');

  self.fir = self.config.get('fir');
  self.firLabel = self.config.get('firLabel');
  self.iir = self.config.get('iir');
  self.iirLabel = self.config.get('iirLabel');
  self.deemphasis = self.config.get('deemphasis');
  self.deemphasisLabel = self.config.get('deemphasisLabel');

  self.i2sDPLL = self.config.get('i2sDPLL');
  self.dsdDPLL = self.config.get('dsdDPLL');
  self.i2sLabelDPLL = self.config.get('i2sLabelDPLL');
  self.dsdLabelDPLL = self.config.get('dsdLabelDPLL');
};

ControllerES9018K2M.prototype.saveConfig = function() {
  var self = this;

  self.config.set('volumeLevel', self.volumeLevel);
  self.config.set('balance', self.balance);
  self.config.set('balanceNote', self.balanceNote);

  self.config.set('fir', self.fir);
  self.config.set('firLabel', self.firLabel);
  self.config.set('iir', self.iir);
  self.config.set('iirLabel', self.iirLabel);
  self.config.set('deemphasis', self.deemphasis);
  self.config.set('deemphasisLabel', self.deemphasisLabel);

  self.config.set('i2sDPLL', self.i2sDPLL);
  self.config.set('i2sLabelDPLL', self.i2sLabelDPLL);
  self.config.set('dsdDPLL', self.dsdDPLL);
  self.config.set('dsdLabelDPLL', self.dsdLabelDPLL);
};

ControllerES9018K2M.prototype.getUIConfig = function() {
  var self = this;
  var defer = libQ.defer();
  var lang_code = self.commandRouter.sharedVars.get('language_code');

  self.getConf(self.configFile);
  self.logger.info("ES9018K2M:getUIConfig:");

  self.commandRouter.i18nJson(__dirname+'/i18n/strings_' + lang_code + '.json',
      __dirname + '/i18n/strings_en.json',
      __dirname + '/UIConfig.json')
  .then(function(uiconf)
  {
    if (self.es9018k2m)
      uiconf.sections[0].description = self.getI18nString('I2S_ENABLED') + self.deviceStatus;
    else
      uiconf.sections[0].description = self.getI18nString('I2S_DISABLED');

    uiconf.sections[1].content[0].config.bars[0].value = self.volumeLevel;
    uiconf.sections[1].content[1].value = self.ready;

    uiconf.sections[2].content[0].config.bars[0].value = self.balance;
    uiconf.sections[2].content[0].description = self.balanceNote;
    uiconf.sections[2].content[1].value =
        {value: self.channel, label: self.channelLabel};

    uiconf.sections[3].content[0].value =
        {value: self.fir, label: self.firLabel};
    uiconf.sections[3].content[1].value =
        {value: self.iir, label: self.iirLabel};
    uiconf.sections[3].content[2].value =
        {value: self.deemphasis, label:  self.deemphasisLabel};

    uiconf.sections[4].content[0].value =
        {value: self.i2sDPLL, label: self.i2sLabelDPLL};
    uiconf.sections[4].content[1].value =
        {value: self.dsdDPLL, label: self.dsdLabelDPLL};
    defer.resolve(uiconf);

    // apply saved configuration data to es9018k2m
    self.applyFunction();
  })
  .fail(function()
  {
    defer.reject(new Error());
  });

  return defer.promise;
};

ControllerES9018K2M.prototype.updateUIConfig = function() {
  var self=this;

  var lang_code = self.commandRouter.sharedVars.get('language_code');
  self.commandRouter.i18nJson(__dirname+'/i18n/strings_' + lang_code + '.json',
      __dirname + '/i18n/strings_en.json',
      __dirname + '/UIConfig.json')
  .then(function(uiconf)
  {
    self.configManager.setUIConfigParam(
        uiconf, 'sections[1].content[0].config.bars[0].value', self.volumeLevel
    );
    self.configManager.setUIConfigParam(
      uiconf, 'sections[1].content[1].value', self.ready
    );

    self.configManager.setUIConfigParam(
        uiconf, 'sections[2].content[0].config.bars[0].value', self.balance
    );
    self.configManager.setUIConfigParam(
        uiconf, 'sections[2].content[0].description', self.balanceNote
    );
    self.configManager.setUIConfigParam(
        uiconf, 'sections[2].content[1].value', {value: self.channel, label: self.channelLabel}
    );

    self.configManager.setUIConfigParam(
        uiconf, 'sections[3].content[0].value', {label: self.firLabel, value: self.fir}
    );
    self.configManager.setUIConfigParam(
        uiconf, 'sections[3].content[1].value', {label: self.iirLabel, value: self.iir}
    );
    self.configManager.setUIConfigParam(
        uiconf, 'sections[3].content[2].value', {label: self.deemphasisLabel, value: self.deemphasis}
    );

    self.configManager.setUIConfigParam(
        uiconf, 'sections[4].content[0].value', {label: self.i2sLabelDPLL, value: self.i2sDPLL}
    );
    self.configManager.setUIConfigParam(
        uiconf, 'sections[4].content[1].value', {label: self.dsdLabelDPLL, value: self.dsdDPLL}
    );

    self.commandRouter.broadcastMessage('pushUiConfig', uiconf);
  })
  .fail(function()
  {
    new Error();
  });
};

ControllerES9018K2M.prototype.loadI18nStrings = function () {
  var self=this;
  var language_code = this.commandRouter.sharedVars.get('language_code');

  self.i18nStrings=fs.readJsonSync(__dirname+'/i18n/strings_'+language_code+".json");
  self.i18nStringsDefaults=fs.readJsonSync(__dirname+'/i18n/strings_en.json');
};

ControllerES9018K2M.prototype.getI18nString = function (key) {
  var self=this;

  if (self.i18nStrings[key] !== undefined)
    return self.i18nStrings[key];
  else
    return self.i18nStringsDefaults[key];
};

// ES9018K2M I2C Controll Methods ------------------------------------------

ControllerES9018K2M.prototype.initVariables = function() {
  var self=this;

  self.ready = true;
  self.volumeLevel = 90;
  self.channel = true;
  self.channelLabel = "Left/Right";

  self.fir = 1;
  self.firLabel = "Fast FIR (default)";
  self.iir = 0;
  self.iirLabel = "47K";
  self.deemphasis = 66;
  self.deemphasisLabel = "Off";

  self.i2sDPLL = 80;
  self.i2sLabelDPLL = "05 (default)";
  self.dsdDPLL = 10;
  self.dsdLabelDPLL = "10 (default)";

  self.lBal = 0;
  self.rBal = 0;
  self.balance = 0;
  self.balanceNote = self.getI18nString('MID_BALANCE');
  self.centerBalance = 39;

  self.localApply = true;
};

ControllerES9018K2M.prototype.initRegister = function()
{
  var self = this;

  self.SABRE_ADDR = 0x48;
  self.SRExact = true;    // exact sample rate value; false = display nominal value

  self.statusReg = 64;
  self.reg0=0x00;  // System settings. Default value of register 0
  self.reg4=0x00;  // Automute time. Default = disabled
  self.reg5=0x68;  // Automute level. Default is some level, but in reg4 default has automute disabled
  self.reg7=0x80;  // General settings. Default value fast fir, pcm iir and unmuted
  //self.reg8=0x81;  // GPIO configuration. GPIO1 set to DPLL Lock; GPIO2 set to input (for SPDIF)
  //self.reg9=0x00;  // Master Mode Control. Default value: master mode off
  //self.reg11=0x02; // Channel Mapping. (Default stereo is Ch1=left, Ch2=right)
  self.reg12=0x5A; // DPLL settings.
          // Default= one level above lowest for I2S
          //          two levels above mid setting for DSD
  self.reg14=0x8A; // Soft Start settings
  //self.reg21=0x00; // Oversampling filter setting and GPIO settings. Default: oversampling ON
};

ControllerES9018K2M.prototype.loadDefaultValue = function() {
  var self = this;

  self.muteES9018K2m();                // Mute DACs
  //self.muteES9018K2m();              // Redundant mute DACs
  self.writeRegister(0, self.reg0);    // System Settings
  self.writeRegister(4, self.reg4);    // Automute
  self.writeRegister(5, self.reg5);    // Automute Level
  //self.writeRegister(8, self.reg8);  // GPIO default configuration
  //self.writeRegister(9, self.reg9);  // Master Mode. Default: OFF
  //self.writeRegister(11, self.reg11);  // stereo
  self.writeRegister(14, self.reg14);  // Soft Start Settings
  self.setVolume(self.volumeLevel);    // Startup volume level
  self.unmuteES9018K2m();
};

ControllerES9018K2M.prototype.execDeviceCheckControl = function() {
  var self=this;
  var revision, message;

  self.logger.info("ControllerES9018K2M::execDeviceCheckControl");
  self.readRegister(self.statusReg).then (function(chipStatus) {
    if ((chipStatus & 0x1C) === 16) {
      self.es9018k2m = true;
      self.logger.info("ControllerES9018K2M::execDeviceCheckControl:chipStatus:" + chipStatus);
      if (chipStatus & 0x20)
        revision = 'revision V';
      else
        revision = 'revision W';

      if (chipStatus & 0x01)
        self.deviceStatus = self.getI18nString('JITTER_LOCKED');
      else
        self.deviceStatus = self.getI18nString('JITTER_NOT_LOCKED');
    }
    else
      self.es9018k2m = false;

    self.logger.info("ControllerES9018K2M::execDeviceCheckControl:" + self.es9018k2m);
    self.logger.info("ControllerES9018K2M::ES9018k2mRevision:"
        + self.es9018k2mRevision);

    if (self.es9018k2m)
      message = self.getI18nString('FOUND_DEVICE') + '[' + revision + ']';
    else
      message = self.getI18nString('NOT_FOUND_DEVICE');

    self.commandRouter.pushToastMessage('info', self.serviceName, message);
  });
};

ControllerES9018K2M.prototype.applyFunction = function() {
  var self = this;

  self.localApply = false;
  self.setBalance(self.balance);

  self.setFirFilter(self.fir);
  self.setIirFilter(self.iir);
  self.setDeemphasisFilter(self.deemphasis, self.deemphasisLabel);

  self.setI2sDPLL(self.i2sDPLL, self.i2sLabelDPLL);
  self.setDsdDPLL(self.dsdDPLL, self.dsdLabelDPLL);

  self.switchChannel();

  self.unmuteES9018K2m();
  self.localApply = true;
};

ControllerES9018K2M.prototype.execLoadDefaultControl= function() {
  var self = this;

  self.initVariables();
  self.initRegister();
  self.loadDefaultValue();
  self.applyFunction();
  self.updateUIConfig();
  self.saveConfig();

  self.commandRouter.pushToastMessage('info', self.serviceName, "reset to default");
};

ControllerES9018K2M.prototype.execVolumeControl = function(data) {
  var self = this;

  self.logger.info("ControllerES9018K2M::execVolumeControl:volume TYPE:"+typeof data['volume_adjust']);
  var volume = parseInt(data['volume_adjust']);
  var ready = data['ready'];

  self.logger.info("ControllerES9018K2M::execVolumeControl:volume:"+volume);
  self.logger.info("ControllerES9018K2M::execVolumeControl:ready:"+ready);

  self.setVolume(volume);
  if (self.ready !== ready) {
    self.ready = ready;
    if (ready)
      self.unmuteES9018K2m();
    else
      self.muteES9018K2m();
    self.logger.info("ControllerES9018K2M::execVolumeControl:MUTE_CHANGE:"+ready);
    self.commandRouter.pushToastMessage('info', self.serviceName, "mute on/off: "+ready);
  };

  self.volumeLevel = volume;
  self.config.set('volumeLevel', volume);

  self.commandRouter.pushToastMessage('info', self.serviceName, "update Volume done");
};

ControllerES9018K2M.prototype.bitset = function(reg, value) {
  reg |= (1 << value);
  return reg;
};

ControllerES9018K2M.prototype.bitclear = function(reg, value) {
  reg &= ~(1 << value);
  return reg;
};

ControllerES9018K2M.prototype.execDpllControl = function (data) {
  var self = this;

  var selectedI2sDpll = data['i2sDPLL'].value;
  var selectedDsdDpll = data['dsdDPLL'].value;

  self.logger.info("ControllerES9018K2M::execDpllControl:i2sDPLL TYPE:"+typeof selectedI2sDpll);
  self.logger.info("ControllerES9018K2M::execDpllControl:i2sDPLL:"+ selectedI2sDpll);

  if (self.i2sDPLL !== selectedI2sDpll) {
    var selectedLabelI2sDpll = data['i2sDPLL'].label;
    self.setI2sDPLL(selectedI2sDpll, selectedLabelI2sDpll);
  }
  if (self.dsdDPLL !== selectedDsdDpll) {
    var selectedLabelDsdDpll = data['dsdDPLL'].label;
    self.setDsdDPLL(selectedDsdDpll, selectedLabelDsdDpll);
  }
};

// DPLL Mode for I2S - upper 4 bits of register 12
ControllerES9018K2M.prototype.setI2sDPLL = function (value, label) {
  var self=this;
  var result;

  result = "i2s DPLL: " + label;
  self.i2sDPLL = value;
  self.i2sLabelDPLL = label;
  self.reg12 &= 0x0F;
  self.reg12 |= value;
  self.logger.info("ControllerES9018K2M::setI2sDPLL:reg12:"+self.reg12);
  self.writeRegister(0x0C, self.reg12);

  if (self.localApply)
    self.commandRouter.pushToastMessage('info', self.serviceName, result);

  self.config.set('i2sDPLL', self.i2sDPLL);
  self.config.set('i2sLabelDPLL', self.i2sLabelDPLL);
};

// DPLL Mode for DSD -lower 4 bits of register 12
ControllerES9018K2M.prototype.setDsdDPLL = function (value, label){
  var self=this;
  var result;

  result = "DSD DPLL: " + label;
  self.dsdDPLL = value;
  self.dsdLabelDPLL= label;
  self.reg12 &= 0xF0;
  self.reg12 |= value;

  self.logger.info("ControllerES9018K2M::setDsdDPLL:reg12:"+self.reg12);
  self.writeRegister(0x0C, self.reg12);

  if (self.localApply)
    self.commandRouter.pushToastMessage('info', self.serviceName, result);

  self.config.set('dsdDPLL', self.dsdDPLL);
  self.config.set('dsdLabelDPLL', self.dsdLabelDPLL);
};

ControllerES9018K2M.prototype.execDigitalFilterControl = function(data) {
  var self=this;

  var selectedFir = data['fir_filter'].value;
  var selectedIir = data['iir_filter'].value;
  var selectedDeemphasis = data['deemphasis_filter'].value;

  if (self.fir !== selectedFir) self.setFirFilter(selectedFir);
  if (self.iir !== selectedIir) self.setIirFilter(selectedIir);
  if (self.deemphasis !== selectedDeemphasis) {
    var deemphasisLabel = data['deemphasis_filter'].label;
    self.setDeemphasisFilter(selectedDeemphasis, deemphasisLabel);
  }
};

ControllerES9018K2M.prototype.setFirFilter = function(selected){
  var self=this;
  var result = "FIR Filter: ";

  self.logger.info("ControllerES9018K2M::setFirFilter:"+selected);
  self.logger.info("ControllerES9018K2M::REG7:"+self.reg7);
  self.logger.info("ControllerES9018K2M::REG21:"+self.reg21);
  self.fir = selected;
  switch (selected) {
    case 0:                       // Slow FIR
      self.reg7=self.bitset(self.reg7,5);       // x 0 1 x x x x x
      self.reg7=self.bitclear(self.reg7,6);     // x 0 1 x x x x x
      self.reg21=self.bitclear(self.reg21,0);   // Use OSF: x x x x x x x 0
      self.writeRegister(7, self.reg7);
      //self.writeRegister(21, self.reg21);
      self.firLabel = "Slow Rolloff";
      break;
    case 1:                       // Fast FIR (Sharp) -Default
      self.reg7=self.bitclear(self.reg7,5);     // x 0 0 x x x x x
      self.reg7=self.bitclear(self.reg7,6);     // x 0 0 x x x x x
      //self.reg21=self.bitclear(self.reg21,0);   // Use OSF: x x x x x x x 0
      self.writeRegister(7, self.reg7);
      //self.writeRegister(21, self.reg21);
      self.firLabel = "Fast Rolloff (default)";
      break;
    case 2:                       // Minimum phase filter (Sharp)
      self.reg7=self.bitclear(self.reg7,5);     // x 1 0 x x x x x
      self.reg7=self.bitset(self.reg7,6);       // x 1 0 x x x x x
      //self.reg21=self.bitclear(self.reg21,0);   // Use OSF: x x x x x x x 0
      self.writeRegister(7, self.reg7);
      self.writeRegister(0x15, self.reg21);
      self.firLabel = "Minimum phase";
      break;
    case 3:                       // Bypass oversampling filter
      self.reg21=self.bitset(self.reg21,0);    // Bypass OSF: x x x x x x x 1
      self.writeRegister(0x15, self.reg21);
      self.firLabel = "Bypass oversampling";
      break;
  }
  result += self.firLabel;
  self.logger.info("ControllerES9018K2M::REG7:AFTER:"+self.reg7);
  self.logger.info("ControllerES9018K2M::REG21:"+self.reg21);

  if (self.localApply)
    self.commandRouter.pushToastMessage('info', self.serviceName, result);

  self.config.set('fir', self.fir);
  self.config.set('firLabel', self.firLabel);
  self.logger.info("ControllerES9018K2M::setFirFilter:RESULT:"+result);
};

ControllerES9018K2M.prototype.setIirFilter = function(selected){
  var self=this;
  var result = "IIR Filter: ";

  self.logger.info("ControllerES9018K2M::setIirFilter:"+selected);
  self.iir = selected;
  switch(selected) {
    case 0:                        // IIR Bandwidth: Normal 47K (for PCM)
      self.reg7=self.bitclear(self.reg7,2);     // x x x x 0 0 x x
      self.reg7=self.bitclear(self.reg7,3);
      self.reg21=self.bitclear(self.reg21,2);   // Use IIR: x x x x x 0 x x
      self.writeRegister(7, self.reg7);
      //self.writeRegister(21, self.reg21);
      self.iirLabel = "47K";
      break;
    case 1:                        // IIR Bandwidth: 50k (for DSD) (D)
      self.reg7=self.bitset(self.reg7,2);     // x x x x 0 1 x x
      self.reg7=self.bitclear(self.reg7,3);
      self.reg21=self.bitclear(self.reg21,2);  // Use IIR: x x x x x 0 x x
      self.writeRegister(7, self.reg7);
      //self.writeRegister(21, self.reg21);
      self.iirLabel = "50K";
      break;
    case 2:                        // IIR Bandwidth: 60k (for DSD)
      self.reg7=self.bitset(self.reg7,3);     // x x x x 1 0 x x
      self.reg7=self.bitclear(self.reg7,2);
      self.reg21=self.bitclear(self.reg21,2); // Use IIR: x x x x x 0 x x
      self.writeRegister(7, self.reg7);
      //self.writeRegister(21, self.reg21);
      self.iirLabel = "60K";
      break;
    case 3:                        // IIR Bandwidth: 70k (for DSD)
      self.reg7=self.bitset(self.reg7,2);     // x x x x 1 1 x x
      self.reg7=self.bitset(self.reg7,3);
      self.reg21=self.bitclear(self.reg21,2); // Use IIR: x x x x x 0 x x
      self.writeRegister(7, self.reg7);
      //self.writeRegister(21, self.reg21);
      self.iirLabel = "70K";
      break;
    case 4:                        // IIR OFF
      self.reg21=self.bitset(self.reg21,2);   // Bypass IIR: x x x x x 1 x x
      self.writeRegister(21, self.reg21);
      self.iirLabel = "OFF";
      break;
  }
  result += self.iirLabel;

  if (self.localApply)
    self.commandRouter.pushToastMessage('info', self.serviceName, result);

  self.config.set('iir', self.iir);
  self.config.set('iirLabel', self.iirLabel);
  self.logger.info("ControllerES9018K2M::setIirFilter:RESULT:"+result);
};

ControllerES9018K2M.prototype.setDeemphasisFilterCtl = function(data) {
  var self=this;

  var value = data['deemphasis_filter'].value;
  var label = data['deemphasis_filter'].label;
  self.logger.info("ControllerES9018K2M::setDeemphasisFilterCtl:"+value);

  self.setDeemphasisFilter(value, label);
};

ControllerES9018K2M.prototype.setDeemphasisFilter = function(value, label) {
  var self=this;
  var result;

  self.logger.info("ControllerES9018K2M::setDeemphasisFilter:"+value);

  result = "Deemphasis: " + label;

  self.deemphasis = value;
  self.deemphasisLabel = label;

  // off:0x4A, auto: 0x8A, 32K:0x0A, 44k:0x1A, 48k:0x2a, reserved: 0x3A
  self.writeRegister(6, value);

  self.config.set('deemphasis', self.deemphasis);
  self.config.set('deemphasisLabel', self.deemphasisLabel);

  if (self.localApply)
    self.commandRouter.pushToastMessage('info', self.serviceName, result);

  self.logger.info("ControllerES9018K2M::setDeemphasisFilter:RESULT:"+result);
};

// toggle function for selecting SR display format
ControllerES9018K2M.prototype.setSRFormat = function () {
  var self=this;

  if (self.SRExact) {     // Currently set to display exact sample rate
    self.SRExact=false;            // Set to Nominal
  }
  else {
    self.SRExact=true;             // Set to display exact sample rate
  }
};

// lBal and rBal are for adjusting for Balance for left and right channels
ControllerES9018K2M.prototype.setVolume = function(regVal) {
  var self=this;

  var value = 100 - regVal;
  self.logger.info("ControllerES9018K2M::setVolume:"+value);
  self.logger.info("ControllerES9018K2M::setVolumeLBAL:"+self.lBal);
  self.logger.info("ControllerES9018K2M::setVolumeRBAL:"+self.rBal);
  self.writeRegister(15, value + self.lBal); // set up volume in Channel 1 (Left)
  self.writeRegister(16, value + self.rBal); // set up volume in Channel 1 (Right)

  if (self.localApply)
    self.commandRouter.pushToastMessage('info', self.serviceName, "Adjust Volume");
};

ControllerES9018K2M.prototype.muteES9018K2m  = function(){
  var self = this;

  self.reg7=self.bitset(self.reg7, 0);               // Mute Channel 1
  self.reg7=self.bitset(self.reg7, 1);               // Mute Channel 2
  self.writeRegister(7, self.reg7);
};

ControllerES9018K2M.prototype.unmuteES9018K2m  = function(){
  var self = this;

  self.reg7=self.bitclear(self.reg7, 0);             // Unmute Channel 1
  self.reg7=self.bitclear(self.reg7, 1);             // Unmute Channel 2
  self.writeRegister(7, self.reg7);
};

/*
  Adjusting Balance. The balance can be adjusted up to 9.5 dB to the right
  channel or to the left channel. The limit of 9.5 dB is just so that the value
  fits in the display.
*/
ControllerES9018K2M.prototype.execBalanceControl = function(data) {
  var self = this;

  var balance = parseInt(data['balance_adjust']);
  var channel = data['channel_switch'].value;
  self.logger.info("ControllerES9018K2M::channel_switch:"+channel.value);

  if (self.balance !== balance) {
    self.balance = balance;
    self.config.set('balance', self.balance);
    self.setBalance(self.balance);
  }
  if (self.channel !== channel.value) {
    self.channel = channel.value;
    self.channelLabel = channel.label;
    self.config.set('channel', self.channel);
    self.switchChannel();
  }
};

ControllerES9018K2M.prototype.switchChannel = function() {
  var self = this;

  self.logger.info("ControllerES9018K2M::switchChannel:"+self.channel);

  if (self.channel)
    self.writeRegister(11, 0x02);
  else
    self.writeRegister(11, 0x01);
};

ControllerES9018K2M.prototype.setBalance = function(value){
  var self=this;
  var result;

  value += self.centerBalance;
  self.logger.info("ControllerES9018K2M::setBalance:"+value);

  if (value === self.centerBalance) {         // Mid point
    self.lBal=0;
    self.rBal=0;
    result = self.getI18nString('MID_BALANCE');
  }
  else {
    result = self.getI18nString('BALANCE') + ": ";
    if (value > self.centerBalance) {
      // adjusting balance to right channel
      self.rBal =0;
      self.lBal =value - self.centerBalance;    // Attenuate left channel
      result += (self.lBal/2).toString();
      result += "dB " + self.getI18nString('RIGHT');
    }
    else {
      // adjusting balance to left channel
      self.lBal=0;
      self.rBal=self.centerBalance - value;      // Attenuate right channel
      result += (self.rBal/2).toString();
      result += "dB "+ self.getI18nString('LEFT');
    }
  }
  self.balanceNote = result;

  // Adjust volume
  self.setVolume(self.volumeLevel);
  self.updateUIConfig();

  if (self.localApply)
    self.commandRouter.pushToastMessage('info', self.serviceName, "Balance Adjust");

  self.logger.info("ControllerES9018K2M::setBalance:RESULT:"+result);
};

ControllerES9018K2M.prototype.execResetBalanceControl = function() {
  var self = this;

  self.balance = 0;
  self.balanceNote = self.getI18nString('MID_BALANCE');
  self.setBalance(self.balance);
  self.updateUIConfig();
};

ControllerES9018K2M.prototype.readRegister = function(regAddr) {
  var self=this;
  var defer = libQ.defer();

  try {
    var wire = new i2c(self.SABRE_ADDR, {device: '/dev/i2c-1'});
    wire.writeByte(regAddr, function(err) {
      self.logger.info("ControllerES9018K2M::readRegister:Write:"+  JSON.stringify(err));
    });
    wire.readByte(function(err, res) {
      self.logger.info("ControllerES9018K2M::readRegister:Read:"+ res);
      defer.resolve(res);
    });
  }
  catch (e) {
    self.logger.info("ControllerES9018K2M::readRegister:ERROR:"+  JSON.stringify(e));
  }
  /*
  try {
    var buffer = new Buffer(1);

    buffer[0] = regAddr;
    i2c1.i2cWriteSync(self.SABRE_ADDR, 1, buffer);
    i2c1.i2cReadSync(self.SABRE_ADDR, 1, buffer);
    self.logger.info("ControllerES9018K2M::I2C:READ:"+ buffer);
    defer.resolve(buffer);
  } catch (e) {
    self.logger.info("ControllerES9018K2M::reaRegisterCatch:ERR:"+  JSON.stringify(e));
  }
  i2c1.closeSync();
  */

  return defer.promise;
};

ControllerES9018K2M.prototype.writeRegister = function(regAddr, regVal) {
  var self=this;

  self.logger.info("ControllerES9018K2M::writeRegister:"+regVal);
  var wire = new i2c(self.SABRE_ADDR, {device: '/dev/i2c-1'});
  wire.writeBytes(regAddr, [regVal], function(err) {
    self.logger.info("ControllerES9018K2M::writeRegister:DONE:"+  JSON.stringify(err));
  });
  /*
  wire.writeByte(regAddr, function(err) {
    self.logger.info("ControllerES9018K2M::writeSabreLeft1:"+  JSON.stringify(err));
  });
  wire.writeByte(regVal, function(err) {
    self.logger.info("ControllerES9018K2M::writeSabreLeft2:"+  JSON.stringify(err));
  });

  var i2c1 = i2cOrg.openSync(1);
  i2c1.i2cWriteSync(self.SABRE_ADDR, regAddr, regVal);
  i2c1.closeSync();
  */
};

///////////////////////NOT USED //////////////////////////////////////
function boolToYesNo(bool) {
  return bool ? 'yes' : 'no';
}

ControllerES9018K2M.prototype.checkI2C = function() {
  var self=this;

  var i2c1 = i2cOld.openSync(1, true);
  var i2cFuncs = i2c1.i2cFuncsSync();
  self.logger.info("ControllerES9018K2M::SCAN:"+ i2c1.scanSync(self.SABRE_ADDR));
  self.logger.info("ControllerES9018K2M::I2C:"+ boolToYesNo(i2cFuncs.i2c));
  self.logger.info("ControllerES9018K2M::SMBus Quick Command:" + boolToYesNo(i2cFuncs.smbusQuick));
  self.logger.info("ControllerES9018K2M::SMBus Send Byte:" + boolToYesNo(i2cFuncs.smbusSendByte));
  self.logger.info("ControllerES9018K2M::SMBus Receive Byte:" + boolToYesNo(i2cFuncs.smbusReceiveByte));
  self.logger.info("ControllerES9018K2M::SMBus Write Byte:" + boolToYesNo(i2cFuncs.smbusWriteByte));
  self.logger.info("ControllerES9018K2M::SMBus Read Byte:" + boolToYesNo(i2cFuncs.smbusReadByte));
  self.logger.info("ControllerES9018K2M::SMBus Write Word:" + boolToYesNo(i2cFuncs.smbusWriteWord));
  self.logger.info("ControllerES9018K2M::SMBus Read Word:" + boolToYesNo(i2cFuncs.smbusReadWord));
  self.logger.info("ControllerES9018K2M::SMBus Process Call:" + boolToYesNo(i2cFuncs.smbusProcCall));
  self.logger.info("ControllerES9018K2M::SMBus Block Write:" + boolToYesNo(i2cFuncs.smbusWriteBlock));
  self.logger.info("ControllerES9018K2M::SMBus Block Read:" + boolToYesNo(i2cFuncs.smbusReadBlock));
  self.logger.info("ControllerES9018K2M::SMBus Block Process Call:" + boolToYesNo(i2cFuncs.smbusBlockProcCall));
  self.logger.info("ControllerES9018K2M::SMBus PEC:" + boolToYesNo(i2cFuncs.smbusPec));
  self.logger.info("ControllerES9018K2M::I2C Block Write:" + boolToYesNo(i2cFuncs.smbusWriteI2cBlock));
  self.logger.info("ControllerES9018K2M::I2C Block Read:" + boolToYesNo(i2cFuncs.smbusReadI2cBlock));
  i2c1.closeSync();
};

ControllerES9018K2M.prototype.i2cScan = function() {
  var self=this;
  var EBUSY = 16; /* Device or resource busy */
  var first, last;

  first=0;
  last=250;
  var addr;

  self.logger.info("ControllerES9018K2M::i2cScan:");
  var i2c1 = i2cOld.openSync(1, true);
  for (addr = 0; addr <= 127; addr += 1) {
    if (addr < first || addr > last) {
      //fs.writeSync(0, '   ');
    } else {
      try {
        i2c1.receiveByteSync(addr);
        self.logger.info("ControllerES9018K2M::i2cScanFOUND:"+  addr.toString(16)); // device found, print addr
      } catch (e) {
        if (e.errno === EBUSY) {
          self.logger.info("ControllerES9018K2M::i2cScan:BUSY:"+  addr.toString(16));
        } else {
          //fs.writeSync(0, ' --');
        }
      }
    }
  }

  i2c1.closeSync();
  self.logger.info("ControllerES9018K2M::DONE");
};
///////////////////////NOT USED //////////////////////////////////////