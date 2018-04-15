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
  var value = data['volume_adjust'];

  self.logger.info("ControllerES9018K2M::updateVolume:"+value);
  if (value)
    self.volumeLevel = parseInt(value);
  else
    self.volumeLevel = value;
  self.config.set('volume_level', self.volumeLevel);
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

// ES9018K2M I2C Controll Methods ------------------------------------------
ControllerES9018K2M.prototype.initES9018k2m = function()
{
  var self = this;

  self.SABRE_ADDR = 0x48;
  self.lBal = 0;
  self.rBal = 0;
  self.volumeLevel = 0;
  self.statusReg = 64;
  self.SRExact = true;    // exact sample rate value; false = display nominal value
  self.currAttnu = 0x64;  //-50 dB this is 50x2=100 or 0x64. Sabre32 is 0 to -127dB in .5dB steps

  self.reg0=0x00;  // System settings. Default value of register 0
  self.reg4=0x00;  // Automute time. Default = disabled
  self.reg5=0x68;  // Automute level. Default is some level, but in reg4 default has automute disabled
  self.reg7=0x80;  // General settings. Default value fast fir, pcm iir and unmuted
  self.reg8=0x81;  // GPIO configuration. GPIO1 set to DPLL Lock; GPIO2 set to input (for SPDIF)
  self.reg10=0x05; // Master Mode Control. Default value: master mode off
  self.reg12=0x5A; // DPLL Settings. Default= one level above lowest for I2S and two levels above
  // mid setting for DSD
  self.reg14=0x8A; // Soft Start Settings
  self.reg21=0x00; // Oversampling filter setting and GPIO settings. Default: oversampling ON
// reg11 will need a R and V variable in order to support MONO
  self.reg11S=0x02; // Channel Mapping. "S" means stereo
  // Default stereo is Ch1=left, Ch2=right
};

ControllerES9018K2M.prototype.checkES9018k2m = function() {
  var self=this;

  self.logger.info("ControllerES9018K2M::checkES9018k2m");
  self.readRegister(self.statusReg).then (function(chipStatus) {
    if ((chipStatus & 0x1C) === 16) {
      self.es9018k2m = true;
      if (chipStatus & 0x20)
        self.es9018k2mRevision = 'rev V';
      else
        self.es9018k2mRevision = 'rev W';
    }
    else
      self.es9018k2m = false;

    self.logger.info("ControllerES9018K2M::checkES9018k2m:" + self.es9018k2m);
    self.logger.info("ControllerES9018K2M::ES9018k2mRevision:"
        + self.es9018k2mRevision);
  });
};

ControllerES9018K2M.prototype.startES9018K2M = function() {
  self.muteES9018K2m();                   // Mute DACs
  self.muteES9018K2m();                   // Redundant mute DACs
  self.writeSabreReg(0x00, self.reg0);    // System Settings
  self.writeSabreReg(0x04, self.reg4);    // Automute
  self.writeSabreReg(0x05, self.reg5);    // Automute Level
  self.writeSabreReg(0x08, self.reg8);    // GPIO default configuration
  self.writeSabreReg(0x0A, self.reg10);   // Master Mode. Default: OFF
  self.writeSabreReg(0x0E, self.reg14);   // Soft Start Settings
  self.writeSabreReg(0x0B, self.reg11S);  // stereo
  self.setSabreVolume(self.currAttnu);    // Startup volume level

  self.unmuteES9018K2m();
};

/*
function bitSet() {
  reg = value;
}

bitSet.prototype.test = function(reg, value) {
  return (reg & (1 << value)) !== 0;
};
bitSet.prototype.toggle = function(reg, value) {
  reg ^= (1 << value);
};
*/

ControllerES9018K2M.prototype.bitset = function(reg, value) {
  reg |= (1 << value);
};

ControllerES9018K2M.prototype.bitclear = function(reg, value) {
  reg &= ~(1 << value);
};

// Set the DPLL Mode for I2S
ControllerES9018K2M.prototype.setI2sDPLL = function (value){
  var self=this;
  var result;

  result = "DL: ";
  self.reg12 = self.reg12 & 0x0F;
  switch(value) {   // set the DPLL values for I2S (upper 4 bits)
    case 0:
      self.reg12=self.reg12 | 0x00;
      self.writeSabreReg(0x0C,self.reg12);
      result += "OFF";
      break;
    case 1:
      self.reg12=self.reg12 | 0x10;
      self.writeSabreReg(0x0C,self.reg12);
      result += "LST";
      break;
    case 2:
      self.reg12=self.reg12 | 0x20;
      self.writeSabreReg(0x0C,self.reg12);
      result += "002";
      break;
    case 3:
      self.reg12=self.reg12 | 0x30;
      self.writeSabreReg(0x0C,self.reg12);
      result += "003";
      break;
    case 4:
      self.reg12=self.reg12 | 0x40;
      self.writeSabreReg(0x0C,self.reg12);
      result += "004";
      break;
    case 5: // Default setting
      self.reg12=self.reg12 | 0x50;
      self.writeSabreReg(0x0C,self.reg12);
      result += "DEF";  // Default setting
      break;
    case 6:
      self.reg12=self.reg12 | 0x60;
      self.writeSabreReg(0x0C,self.reg12);
      result += "006";
      break;
    case 7:
      self.reg12=self.reg12 | 0x70;
      self.writeSabreReg(0x0C,self.reg12);
      result += "007";
      break;
    case 8:
      self.reg12=self.reg12 | 0x80;
      self.writeSabreReg(0x0C,self.reg12);
      result += "008";
      break;
    case 9:
      self.reg12=self.reg12 | 0x90;
      self.writeSabreReg(0x0C,self.reg12);
      result += "009";
      break;
    case 10:
      self.reg12=self.reg12 | 0xA0;
      self.writeSabreReg(0x0C,self.reg12);
      result += "010";
      break;
    case 11:
      self.reg12=self.reg12 | 0xB0;
      self.writeSabreReg(0x0C,self.reg12);
      result += "011";
      break;
    case 12:
      self.reg12=self.reg12 | 0xC0;
      self.writeSabreReg(0x0C,self.reg12);
      result += "012";
      break;
    case 13:
      self.reg12=self.reg12 | 0xD0;
      self.writeSabreReg(0x0C,self.reg12);
      result += "013";
      break;
    case 14:
      self.reg12=self.reg12 | 0xE0;
      self.writeSabreReg(0x0C,self.reg12);
      result += "014";
      break;
    case 15:
      self.reg12=self.reg12 | 0xF0;
      self.writeSabreReg(0x0C,self.reg12);
      result += "HST";
      break;
  }

  return result;
};

// Set the DPLL Mode for DSD -lower 4 bits
ControllerES9018K2M.prototype.setDsdDPLL = function (value){
  var self=this;
  var result = "";

  self.reg12 = self.reg12 & 0xF0;
  switch(value) {                // Here we set the DPLL values for DSD (lower 4 bits)
    case 0:
      self.reg12=self.reg12 | 0x00;
      self.writeSabreReg(0x0C,self.reg12);
      result += "OFF";
      break;
    case 1:
      self.reg12=self.reg12 | 0x01;
      self.writeSabreReg(0x0C,self.reg12);
      result += "LST";
      break;
    case 2:
      self.reg12=self.reg12 | 0x02;
      self.writeSabreReg(0x0C,self.reg12);
      result += "002";
      break;
    case 3:
      self.reg12=self.reg12 | 0x03;
      self.writeSabreReg(0x0C,self.reg12);
      result += "003";
      break;
    case 4:
      self.reg12=self.reg12 | 0x04;
      self.writeSabreReg(0x0C,self.reg12);
      result += "004";
      break;
    case 5:
      self.reg12=self.reg12 | 0x05;
      self.writeSabreReg(0x0C,self.reg12);
      result += "005";
      break;
    case 6:
      self.reg12=self.reg12 | 0x06;
      self.writeSabreReg(0x0C,self.reg12);
      result += "006";
      break;
    case 7:
      self.reg12=self.reg12 | 0x07;
      self.writeSabreReg(0x0C,self.reg12);
      result += "007";
      break;
    case 8:
      self.reg12=self.reg12 | 0x08;
      self.writeSabreReg(0x0C,self.reg12);
      result += "008";
      break;
    case 9:
      self.reg12=self.reg12 | 0x09;
      self.writeSabreReg(0x0C,self.reg12);
      result += "009";
      break;
    case 10: // Default Setting
      self.reg12=self.reg12 | 0x0A;
      self.writeSabreReg(0x0C,self.reg12);
      result += "DEF";
      break;
    case 11:
      self.reg12=self.reg12 | 0x0B;
      self.writeSabreReg(0x0C,self.reg12);
      result += "011";
      break;
    case 12:
      self.reg12=self.reg12 | 0x0C;
      self.writeSabreReg(0x0C,self.reg12);
      result += "012";
      break;
    case 13:
      self.reg12=self.reg12 | 0x0D;
      self.writeSabreReg(0x0C,self.reg12);
      result += "013";
      break;
    case 14:
      self.reg12=self.reg12 | 0x0E;
      self.writeSabreReg(0x0C,self.reg12);
      result += "014";
      break;
    case 15:
      self.reg12=self.reg12 | 0x0F;
      self.writeSabreReg(0x0C,self.reg12);
      result += "HST";
      break;
  }

  return result;
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

ControllerES9018K2M.prototype.setFirFilter = function(data){
  var self=this;
  var result = "Fir: ";

  var selected = data['fir_filter'].value;
  self.logger.info("ControllerES9018K2M::setFirFilter:"+JSON.stringify(selected));

  switch(selected.value) {
    case -1:
      result += "NONE";
      break;
    case 0:                       // Slow FIR
      self.bitset(self.reg7,5);             // x 0 1 x x x x x
      self.bitclear(self.reg7,6);           // x 0 1 x x x x x
      self.bitclear(self.reg21,0);          // Use OSF: x x x x x x x 0
      self.writeSabreReg(0x0E, self.reg7);
      self.writeSabreReg(0x15, self.reg21);
      result += "Slow";
      break;
    case 1:                       // Fast FIR (Sharp) -Default
      self.bitclear(self.reg7,5);           // x 0 0 x x x x x
      self.bitclear(self.reg7,6);           // x 0 0 x x x x x
      self.bitclear(self.reg21,0);          // Use OSF: x x x x x x x 0
      self.writeSabreReg(0x0E, self.reg7);
      self.writeSabreReg(0x15, self.reg21);
      result += "Fast Sharp";
      break;
    case 2:                       // Minimum phase filter (Sharp)
      self.bitclear(self.reg7,5);           // x 1 0 x x x x x
      self.bitset(self.reg7,6);             // x 1 0 x x x x x
      self.bitclear(self.reg21,0);          // Use OSF: x x x x x x x 0
      self.writeSabreReg(0x0E, self.reg7);
      self.writeSabreReg(0x15, self.reg21);
      result += "Minimum Phase";
      break;
    case 3:                       // Bypass oversampling filter
      self.bitset(reg21,0);            // Bypass OSF: x x x x x x x 1
      self.writeSabreReg(0x15, self.reg21);
      result += "Bypass oversampling";
      break;
  }

  self.logger.info("ControllerES9018K2M::setFirFilter:RESULT:"+result);
};

ControllerES9018K2M.prototype.setIirFilter = function(data){
  var self=this;
  var result;

  var selected = data['iir_filter'].value;
  self.logger.info("ControllerES9018K2M::setIirFilter:"+JSON.stringify(selected));

  switch(selected.value) {
    case 0:                        // IIR Bandwidth: Normal 47K (for PCM)
      self.bitclear(self.reg7,2);           // x x x x 0 0 x x
      self.bitclear(self.reg7,3);
      self.bitclear(self.reg21,2);          // Use IIR: x x x x x 0 x x
      self.writeSabreReg(0x0E, self.reg7);
      self.writeSabreReg(0x15, self.reg21);
      result = "47K PCM";
      break;
    case 1:                        // IIR Bandwidth: 50k (for DSD) (D)
      self.bitset(self.reg7,2);              // x x x x 0 1 x x
      self.bitclear(self.reg7,3);
      self.bitclear(self.reg21,2);           // Use IIR: x x x x x 0 x x
      self.writeSabreReg(0x0E, self.reg7);
      self.writeSabreReg(0x15, self.reg21);
      result = "50K DSD";
      break;
    case 2:                        // IIR Bandwidth: 60k (for DSD)
      self.bitset(self.reg7,3);              // x x x x 1 0 x x
      self.bitclear(self.reg7,2);
      self.bitclear(self.reg21,2);           // Use IIR: x x x x x 0 x x
      self.writeSabreReg(0x0E, self.reg7);
      self.writeSabreReg(0x15, self.reg21);
      result = "60K DSD";
      break;
    case 3:                        // IIR Bandwidth: 70k (for DSD)
      self.bitset(self.reg7,2);              // x x x x 1 1 x x
      self.bitset(self.reg7,3);
      self.bitclear(self.reg21,2);           // Use IIR: x x x x x 0 x x
      self.writeSabreReg(0x0E, self.reg7);
      self.writeSabreReg(0x15, self.reg21);
      result = "70K DSD";
      break;
    case 4:                        // IIR OFF
      self.bitset(self.reg21,2);             // Bypass IIR: x x x x x 1 x x
      self.writeSabreReg(0x15, self.reg21);
      result = "OFF";
      break;
  }

  self.logger.info("ControllerES9018K2M::setIirFilter:RESULT:"+result);
};

// lBal and rBal are for adjusting for Balance for left and right channels
ControllerES9018K2M.prototype.setSabreVolume = function(regVal) {
  var self=this;

  self.logger.info("ControllerES9018K2M::setSabreVolume:"+regVal);
  self.writeSabreLeftReg(15, regVal+self.lBal); // set up volume in Channel 1 (Left)
  self.writeSabreLeftReg(16, regVal+self.rBal); // set up volume in Channel 2 (Right)
};

ControllerES9018K2M.prototype.muteES9018K2m  = function(){
  self.bitset(self.reg7, 0);               // Mute Channel 1
  self.bitset(self.reg7, 1);               // Mute Channel 2
  self.writeSabreReg(0x07, self.reg7);
};

ControllerES9018K2M.prototype.unmuteES9018K2m  = function(){
  self.bitclear(self.reg7, 0);             // Unmute Channel 1
  self.bitclear(self.reg7, 1);             // Unmute Channel 2
  self.writeSabreReg(0x07, self.reg7);
};

ControllerES9018K2M.prototype.setDeemphasis = function(value){ // register 6
  var self=this;
  var result;

  result = "Deemphasis: ";
  switch(value){
    case 0:                        // OFF: 0 1 0 0 1 0 1 0 = 0x4A
      self.writeSabreReg(0x06,0x4A);
      result += "OFF";
      break;
    case 1:                        // AUTO: 1 0 0 0 1 0 1 0 = 0x8A
      self.writeSabreReg(0x06,0x8A);
      result += "AUT";
      break;
    case 2:                        // MANUAL 32K: 0 0 0 0 1 0 1 0 = 0x0A
      self.writeSabreReg(0x06,0x0A);
      result += "32K";
      break;
    case 3:                        // MANUAL 44K: 0 0 0 1 1 0 1 0 = 0x1A
      self.writeSabreReg(0x06,0x1A);
      result += "44K";
      break;
    case 4:                        // MANUAL 48K: 0 0 1 0 1 0 1 0 = 0x2A
      self.writeSabreReg(0x06,0x2A);
      result += "48K";
      break;
    case 5:                        // MANUAL RESERVED: 0 0 1 1 1 0 1 0 = 0x3A (for fun)
      self.writeSabreReg(0x06,0x3A);
      result += "Reserved";
      break;
  }

  return result;
};

/*
  Adjusting Balance. The balance can be adjusted up to 9.5 dB to the right
  channel or to the left channel. The limit of 9.5 dB is just so that the value
  fits in the display. In theory you can completely turn-off one or the other
  channel. The way it works is to increase the attenuation of one channel or
  the other channel. If the Balance is to the right channel (turning the knob
  clockwise), then the display will indicate how many dBs is the left channel
  attenuated - or how much louder is the right channel compared with the
  left channel
*/
ControllerES9018K2M.prototype.setBalance = function(value){
  var self=this;
  var result;

  if (value === 19) {  // Mid point
    self.lBal=0;
    self.rBal=0;
    result = "BAL ";
  }
  else {
    if (value > 19) {           // Adjusting balance to right channel
      self.rBal =0;             // No additional attenuation for right channel
      self.lBal =value-19;              // Attenuate left channel
      result = lBal/2;             // Print whole dB value
      if(self.lBal % 2)
        result += ".5";    // Print fraction dB value
      else
        result += ".0";
      result += "R";
    }
    else {                       // Adjusting balance to left channel
      self.lBal=0;                        // No additional attenuation for left channel
      self.rBal=19-value;                 // Attenuate right channel
      result = self.rBal/2;             // Print whole dB value
      if(self.rBal % 2)
        result += ".5";    // Print fraction dB value
      else
        result += ".0";
      result += "L";
    }
  }

  // Adjust volume based on the current balance settings
  self.setSabreVolume(self.currAttnu);
  return result;
};

ControllerES9018K2M.prototype.readRegister = function(regAddr) {
  var self=this;
  var result;
  var defer = libQ.defer();

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

  return defer.promise;
};

// CONTROLLING THE DIGITAL ATTENUATION (VOLUME)
ControllerES9018K2M.prototype.writeSabreLeftReg = function (regAddr, regVal) {
  var self=this;

  var wire = new i2c(self.SABRE_ADDR, {device: '/dev/i2c-1'});
  self.logger.info("ControllerES9018K2M::writeSabreLeftReg:"+regVal);
  wire.writeBytes(regAddr, [regVal], function(err) {
    self.logger.info("ControllerES9018K2M::writeSabreLeftReg:DONE:"+  JSON.stringify(err));
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

// The following routine writes to both chips in dual mono mode. With some exceptions, one only needs
// to set one of the chips to be the right channel after all registers are modified.
ControllerES9018K2M.prototype.writeSabreReg = function(regAddr, regVal) {
  var self=this;

  // By default the chip with addres 0x48 is the left channel
  self.writeSabreLeftReg(regAddr, regVal);
};

/////////////////////////////////////////////////////////////////////
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
