'use strict';

// This Volumio plugin provides Korean TV

var libQ = require('kew');
var fs = require('fs-extra');
var config = require('v-conf');
var i2c  = require('i2c-bus');
var _ = require('lodash/core');

var DS1621_ADDR = 0x48,
    CMD_ACCESS_CONFIG = 0xac,
    CMD_READ_TEMP = 0xaa,
    CMD_START_CONVERT = 0xee;

module.exports = ControllerES9018K2M;

function ControllerES9018K2M(context) {
	var self = this;

  self.context = context;
  self.commandRouter = this.context.coreCommand;
  self.logger = this.context.logger;
  self.configManager = this.context.configManager;
  self.state = {};
  self.stateMachine = self.commandRouter.stateMachine;
  self.player = null;
  self.videoSource = null;
  self.logger.info("ControllerES9018K2M::constructor");
}

ControllerES9018K2M.prototype.onVolumioStart = function()
{
  var self = this;

  this.configFile=this.commandRouter.pluginManager.getConfigurationFile(this.context,'config.json');
  self.getConf(this.configFile);

  return libQ.resolve();
};

ControllerES9018K2M.prototype.getConfigurationFiles = function () {
  return ['config.json'];
};

ControllerES9018K2M.prototype.onStart = function() {
  var self = this;
  
  self.loadRadioI18nStrings();
  self.addTVResource();
  self.audioOutput = self.config.get("output_device");

  self.logger.info("ES9018K2M:audioOutput:"+self.audioOutput);

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
    uiconf.sections[0].content[0].value.label = self.audioOutput.toUpperCase();
    uiconf.sections[0].content[0].value.value = self.audioOutput;

    self.configManager.setUIConfigParam(uiconf, 'sections[0].content[6].description', JSON.stringify(self.videoDesc));

    defer.resolve(uiconf);
  })
  .fail(function()
  {
    defer.reject(new Error());
  });

  return defer.promise;
};

ControllerES9018K2M.prototype.updateConfig = function(data) {
  var self = this;

  self.logger.info("ControllerES9018K2M::updateConfig:"+data['output_device']);

  self.config.set('output_device',  data['output_device'].value);
  self.config.set('source', data['source'].value);

  self.audioOutput = data['output_device'].value;
  self.videoSource = data['source'].value;
  self.youtubeUrl = data['youtube_url'];

  self.runOmxPlay([self.videoSource]);
};

ControllerES9018K2M.prototype.addTVResource = function() {
  var self=this;

  self.tvEnabled = false;
  var tvResource = fs.readJsonSync(__dirname+'/tv_stations.json');

};

ControllerES9018K2M.prototype.loadRadioI18nStrings = function () {
  var self=this;
  var language_code = this.commandRouter.sharedVars.get('language_code');

  self.i18nStrings=fs.readJsonSync(__dirname+'/i18n/strings_'+language_code+".json");
  self.i18nStringsDefaults=fs.readJsonSync(__dirname+'/i18n/strings_en.json');
};

ControllerES9018K2M.prototype.getRadioI18nString = function (key) {
  var self=this;

  if (self.i18nStrings[key] !== undefined)
    return self.i18nStrings[key];
  else
    return self.i18nStringsDefaults[key];
};

ControllerES9018K2M.prototype.errorToast = function (station, msg) {
  var errorMessage = self.getRadioI18nString(msg);
  errorMessage.replace('{0}', station.toUpperCase());
  self.commandRouter.pushToastMessage('error',
      self.getRadioI18nString('PLUGIN_NAME'), errorMessage);
};

