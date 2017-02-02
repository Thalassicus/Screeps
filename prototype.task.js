
module.exports = {	
	name: 			"",
	weight: 		0,
	say: 			"",
	canStart: 		function() {},
	canContinue: 	function() {},
	doTask: 		function() {},
	getTarget: 		function() {},
	
	init: function(name, weight, say, canStart, canContinue, doTask, getTarget){
		this.name			= name
		this.weight			= weight
		this.say			= say
		this.canStart		= canStart
		this.canContinue	= canContinue
		this.doTask			= doTask
		this.getTarget		= getTarget
	},
};

