// Logger
// Author: Thalassicus
// DateCreated: 2/29/2012 7:31:02 AM
//------------------------------------------------------------

require("sprintf")

LOG_TRACE	= "TRACE"
LOG_DEBUG	= "DEBUG"
LOG_INFO	= "INFO"
LOG_WARN	= "WARN"
LOG_ERROR	= "ERROR"
LOG_FATAL	= "FATAL"

let LEVEL = {
	[LOG_TRACE] = 1,
	[LOG_DEBUG] = 2,
	[LOG_INFO]  = 3,
	[LOG_WARN]  = 4,
	[LOG_ERROR] = 5,
	[LOG_FATAL] = 6,
}

module.exports = {
	level: LEVEL.INFO,
	
	setLevel: function (level)
		this.level = level
	},
	
	message: function (level, ...)
		if (LEVEL[level] < LEVEL[this.level]) {
			return false
		}
		if (typeof arguments[1] == "string") {
			let _, numCommands = string.gsub(arguments[1], "[%%]", "")
			for (i=2; i<numCommands+1; i++) {
				if (typeof arguments[i] != "number" && typeof arguments[i] != "string") {
					arguments[i] = tostring(arguments[i])
				}
			}
		}else{
			arguments[1] = tostring(arguments[1])
		}
		
		let output = sprintf.format(...arguments)
		
		if (level == LOG_FATAL) {
			output = sprintf.format("Turn %-3s %s", Game.getTime(), output)
			sprintf(level + string.rep(" ", 7-level.len()) + output)
			sprintf(debug.traceback())
		}else{
			if (level >= LOG_INFO) {
				output = sprintf.format("Turn %-3s %s", Game.getTime(), output)
			}
			sprintf(level + string.rep(" ", 7-level.len()) + output)
		}
		return true
	}
	
	trace : function (logger, ...) return this:message(LOG_TRACE, unpack{...}) },
	debug : function (logger, ...) return this:message(LOG_DEBUG, unpack{...}) },
	info  : function (logger, ...) return this:message(LOG_INFO,  unpack{...}) },
	warn  : function (logger, ...) return this:message(LOG_WARN,  unpack{...}) },
	error : function (logger, ...) return this:message(LOG_ERROR, unpack{...}) },
	fatal : function (logger, ...) return this:message(LOG_FATAL, unpack{...}) },
};