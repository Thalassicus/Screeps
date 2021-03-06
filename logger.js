// Logger
// Author: Thalassicus
// DateCreated: 2/29/2012 7:31:02 AM
//------------------------------------------------------------

require("sprintf")

var LEVEL_TRACE	= "TRACE"
var LEVEL_DEBUG	= "DEBUG"
var LEVEL_INFO	= "INFO"
var LEVEL_WARN	= "WARN"
var LEVEL_ERROR	= "ERROR"
var LEVEL_FATAL	= "FATAL"

levelType = {
	LEVEL_TRACE : 0,
	LEVEL_DEBUG : 1,
	LEVEL_INFO  : 2,
	LEVEL_WARN  : 3,
	LEVEL_ERROR : 4,
	LEVEL_FATAL : 5,
}

levelString = [
	LEVEL_TRACE ,
	LEVEL_DEBUG ,
	LEVEL_INFO  ,
	LEVEL_WARN  ,
	LEVEL_ERROR ,
	LEVEL_FATAL ,
]

module.exports = {
	levelThreshold: levelType.LEVEL_DEBUG,
	level: levelType.LEVEL_DEBUG,
	
	setLevel: function (level){
		this.levelThreshold = level
	},
	
	message: function (){
		let level = this.level
		if (level < this.levelThreshold) {
			//console.log("level "+level+"<"+this.levelThreshold)
			return false
		}
		
		if (typeof arguments[0] != "string") arguments[0] = String(arguments[0])
		
		let output = sprintf(...arguments)
		
		// time
		if (level >= levelType.LEVEL_INFO) {
			//output = sprintf("Tick %-3s %s", Game.time, output)
		}
		
		// level
		output = sprintf(levelString[level] + " ".repeat(7-levelString[level].length) + output)
		
		// stack trace
		if (level >= levelType.LEVEL_ERROR) {
			output = Error(output).stack
		}
		
		// save important messages for email
		if (level >= levelType.LEVEL_INFO) {
			Memory.log = Memory.log + sprintf("\n%s Tick %-3s %s", new Date().toLocaleTimeString(), Game.time, output)
			if (Memory.log.length > 1000000) {
				Memory.log = "=== ERASED LOG FILE (OUT OF MEMORY) ==="
			}
		}else{
			output = sprintf("Tick %-3s %s", Game.time, output)
		}
		
		console.log(output)
		return true
	},
	
	trace : function () { this.level = levelType.LEVEL_TRACE; return this.message(...arguments) },
	debug : function () { this.level = levelType.LEVEL_DEBUG; return this.message(...arguments) },
	info  : function () { this.level = levelType.LEVEL_INFO;  return this.message(...arguments) },
	warn  : function () { this.level = levelType.LEVEL_WARN;  return this.message(...arguments) },
	error : function () { this.level = levelType.LEVEL_ERROR; return this.message(...arguments) },
	fatal : function () { this.level = levelType.LEVEL_FATAL; return this.message(...arguments) },
};