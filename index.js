'use strict';

var libQ = require('kew');
var fs = require('fs-extra');
var config = require('v-conf');
var i2c  = require('i2c-bus');
var _ = require('lodash/core');

module.exports = ControllerES9018K2M;

function ControllerES9018K2M(context) {
	var self = this;

  self.context = context;
  self.commandRouter = this.context.coreCommand;
  self.logger = this.context.logger;
  self.configManager = this.context.configManager;
  self.stateMachine = this.commandRouter.stateMachine;
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
  //self.addResource();
  self.initES9018k2m();
  self.volumeLevel = self.config.get("volume_level");

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

ControllerES9018K2M.prototype.getUIConfig = function() {
  var self = this;
  var defer = libQ.defer();
  var lang_code = this.commandRouter.sharedVars.get('language_code');

  self.getConf(this.configFile);
  self.logger.info("ES9018K2M:getUIConfig");

  self.commandRouter.i18nJson(__dirname+'/i18n/strings_' + lang_code + '.json',
      __dirname + '/i18n/strings_en.json',
      __dirname + '/UIConfig.json')
  .then(function(uiconf)
  {
    uiconf.sections[0].content[0].value = self.volumeLevel;

    defer.resolve(uiconf);
  })
  .fail(function()
  {
    defer.reject(new Error());
  });

  return defer.promise;
};

ControllerES9018K2M.prototype.updateVolume = function(data) {
  var self = this;

  self.logger.info("ControllerES9018K2M::updateVolume:"+data['volume_id']);
  self.config.set('volumeLevel', data['volume_id']);
  self.volumeLevel = data['volume_id'];
  self.setSabreVolume(self.volumeLevel);
};

ControllerES9018K2M.prototype.addResource = function() {
  var self=this;

  var resource = fs.readJsonSync(__dirname+'/tv_stations.json');

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

ControllerES9018K2M.prototype.initES9018k2m = function()
{
  var self = this;

  self.SABRE_ADDR = 0x48;
  self.lBal = 0;
  self.rBal = 0;
  self.volumeLevel = 0;
};

///////////
// CONTROLLING THE DIGITAL ATTENUATION (VOLUME)
ControllerES9018K2M.prototype.writeSabreLeftReg = function (regAddr, regVal) {
  var self=this;

  var i2c1 = i2c.openSync(1);
  i2c1.i2cWriteSync(self.SABRE_ADDR, regAddr, regVal);
  i2c1.closeSync();
};


// The following routine writes to both chips in dual mono mode. With some exceptions, one only needs
// to set one of the chips to be the right channel after all registers are modified.
ControllerES9018K2M.prototype.writeSabreReg = function(regAddr, regVal) {
  var self=this;

  // By default the chip with addres 0x48 is the left channel
  self.writeSabreLeftReg(regAddr, regVal);
};

ControllerES9018K2M.prototype.setSabreVolume = function(regVal) {
  var self=this;

  self.logger.info("ControllerES9018K2M::setSabreVolume:"+regVal);
  // lBal and rBal are for adjusting for Balance for left and right channels
  self.writeSabreLeftReg(15, regVal+self.lBal); // set up volume in Channel 1 (Left)
  self.writeSabreLeftReg(16, regVal+self.rBal); // set up volume in Channel 2 (Right)
}
