  
let _ = require("lodash")

var taskDirector = require("taskDirector")

module.exports = {
	
}

//
// Priorities
//

Memory.defaultJobPriorities = {
	haul: [
		{"key": "salvage",   	"value": 3},
		{"key": "energize",  	"value": 8},
		{"key": "goHome",	 	"value": 2},
		{"key": "storeAdd",  	"value": 7},
		{"key": "storeGet",  	"value": 1},
		{"key": "idle",      	"value": 0},
	],
	normal: [
		{"key": "energize",  	"value": 8},
		{"key": "repairCritical","value": 9},
		{"key": "upgrade",   	"value": 1},
		{"key": "build",     	"value": 6},
		{"key": "repair",    	"value": 9},
		{"key": "wall",   	 	"value": 5},
		{"key": "goHome",	 	"value": 2},
		{"key": "storeAdd",  	"value": 7},
		{"key": "harvest",   	"value": 2},
		{"key": "harvestFar",	"value": 2},
		{"key": "storeGet",  	"value": 1},
		{"key": "salvage",   	"value": 3},
		{"key": "upgradeFallback","value": 1},
		{"key": "idle",      	"value": 0},
	],
	grow: [
		{"key": "energize",  	"value": 8},
		{"key": "repairCritical","value": 9},
		{"key": "build",     	"value": 7},
		{"key": "salvage",   	"value": 3},
		{"key": "storeGet",  	"value": 2},
		{"key": "harvest",   	"value": 1},
		{"key": "storeAdd",	 	"value": 2},
		{"key": "idle",      	"value": 0},
	],
	recycle: [
		{"key": "energize",  	"value": 8},
		{"key": "storeAdd",  	"value": 7},
		{"key": "recycle",	 	"value": 8},
	],
	scout: [
		{"key": "scout",  	 	"value": 8},
	],
	attackMelee: [
		{"key": "attackMelee",  "value": 10},
		{"key": "heal",    	 	"value": 10},
		{"key": "salvage",   	"value": 3},
		{"key": "storeAdd",  	"value": 7},
		{"key": "goHome",	 	"value": 2},
		{"key": "guardPost", 	"value": 8},
		{"key": "idle",  	 	"value": 8},
	],
	attackRanged: [
		{"key": "attackRanged", "value": 10},
		{"key": "heal",    	 	"value": 10},
		{"key": "salvage",   	"value": 3},
		{"key": "storeAdd",  	"value": 7},
		{"key": "goHome",	 	"value": 2},
		{"key": "guardPost", 	"value": 8},
		{"key": "idle",  	 	"value": 8},
	],
	heal: [
		{"key": "heal",    	 	"value": 10},
		{"key": "salvage",   	"value": 3},
		{"key": "storeAdd",  	"value": 7},
		{"key": "goHome",	 	"value": 2},
		{"key": "guardPost", 	"value": 8},
		{"key": "idle",  	 	"value": 8},
	],
}

Room.prototype.setTaskLimits = function() {
	this.memory.taskCount = {
		"attackMelee":  0,
		"attackRanged": 0,
		"heal": 		0,
		"salvage":    	0,
		"repairCritical": 0,
		"energize":   	0,
		"build":      	0,
		"repair":     	0,
		"wall":    	  	0,
		"harvest":    	0,
		"upgrade":    	0,
		"harvestFar": 	0,
		"goHome": 	  	0,
		"storeAdd":     0,
		"storeGet":   	0,
		"idle":       	0,
		"guardPost":    0,
		"scout":      	0,
		"upgradeFallback": 0,
		"recycle":    	0,
	}
	this.memory.taskMax = {
		"salvage":    	6,
		"repairCritical": 	4,
		"build":      	5,
		"repair":     	2,
		"wall":    	  	10,
		"harvest":    	6,
		"upgrade":    	1,
		"harvestFar": 	15,
		"energize":   	5,
		"goHome": 		999,
		"upgradeFallback": 	999,
		"attackMelee":  999,
		"attackRanged": 999,
		"heal":     	999,
		"storeAdd":     999,
		"storeGet":   	999,
		"scout":      	999,
		"idle":      	999,
		"guardPost":    999,
		"recycle":    	999,
	}
	for (i=0; i<this.memory.people.length; i++){
		let person = Game.creeps[this.memory.people[i]]
		if (person && person.getTask()){
			//console.log("DEBUG: setTaskLimits: "+person.name+" has task "+person.getTask()+" ("+this.getTaskCount(person.getTask())+"+1)")
			this.changeTaskCount(person.getTask(), 1)
		}
	}
}

//
// Jobs
//

Room.prototype.setJobLimits = function() {
	this.memory.jobCount = {
		"attackMelee":	0,
		"attackRanged":	0,
		"heal":		0,
		"normal":	0,
		"haul":		0,
		"grow":		0,
		"recycle":	0,
		"scout":	0,
	}
	this.memory.jobMax = {
		"attackMelee":  2,
		"attackRanged": 2,
		"heal": 	1,
		"normal":	999,
		"haul":		1,
		"grow":		999,
		"recycle":	999,
		"scout":	999,
	}
	if (this.memory.people){
		for (i=0; i<this.memory.people.length; i++){
			let person = Game.creeps[this.memory.people[i]]
			if (person && person.getJob()){
				this.changeJobCount(person.getJob(), 1)
			}
		}
	}
}

Creep.prototype.getJob = function(){
	if (!this.memory.jobType) {
		this.setJob()
	}
	return this.memory.jobType
}

Creep.prototype.setJob = function(jobType, isJobPermanent){
	if (!jobType && !this.memory.jobType){
		jobType = "normal"
	}
	this.memory.isJobPermanent = this.memory.isJobPermanent || isJobPermanent || false
	
	if (this.memory.isJobPermanent && jobType != "recycle"){
		this.memory.priorities = Memory.defaultJobPriorities[this.memory.jobType]
	}else{
		this.memory.priorities = Memory.defaultJobPriorities[jobType || this.memory.jobType]
		//console.log("TRACE setJob: "+this.name+" priorities = "+this.memory.priorities)
	}
	
	if (this.memory.jobType && this.memory.isJobPermanent && jobType != "recycle") {
		return false
	}
	
	let oldJob = this.memory.jobType
	if (oldJob && oldJob == jobType){
		return true
	}
	
	let homeRoom = Game.rooms[this.memory.homeRoomName]
	if (oldJob) {
		homeRoom.unassignJob(this.name, oldJob)
	}
	
	this.memory.jobType = jobType	
	this.room.changeJobCount(jobType, 1)
	
	if (this.memory.priorities != undefined){
		this.setTask() //priorities[priorities.length-1].key)
	}
}


Room.prototype.getJobCount = function(job, includeOldPeople) {
	if (!this.memory.jobCount) this.setJobLimits()
	return this.memory.jobCount[job]
}
	
Room.prototype.setJobCount = function(job, value) {
	if (!this.memory.jobCount) this.setJobLimits()
	this.memory.jobCount[job] = Math.max( 0, value)	
}

Room.prototype.changeJobCount = function(job, value) {
	if (!this.memory.jobCount) this.setJobLimits()
	this.memory.jobCount[job] = Math.max( 0, this.memory.jobCount[job] + value)
}

Room.prototype.getJobMax = function(job) {
	if (!this.memory.jobCount) this.setJobLimits()
	return this.memory.jobMax[job]
}
	
Room.prototype.setJobMax = function(job, value) {
	if (!this.memory.jobCount) this.setJobLimits()
	this.memory.jobMax[job] = value	
}
