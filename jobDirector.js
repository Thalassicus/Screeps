let _ = require("lodash")

var taskDirector = require("taskDirector")
require("sprintf")
let log = require("logger")
log.setLevel(levelType.LEVEL_DEBUG)

module.exports = {
	
}

//
// Priorities
//

Memory.defaultJobPriorities = {
	feed: [
		{"key": "pickup",   	"value": 8},
		{"key": "energize",  	"value": 8},
		{"key": "goHome",	 	"value": 8},
		{"key": "storeAdd",  	"value": 8},
		{"key": "getHaul",  	"value": 8},
		{"key": "storeGet",  	"value": 8},
		{"key": "idle",      	"value": 8},
	],
	haul: [
		{"key": "pickup",   	"value": 8},
		{"key": "energize",  	"value": 8},
		{"key": "goHome",	 	"value": 8},
		{"key": "storeAdd",  	"value": 8},
		{"key": "getHaul",  	"value": 8},
		{"key": "storeGet",  	"value": 8},
		{"key": "idle",      	"value": 8},
	],
	mine: [
		{"key": "mine",   		"value": 8},
		{"key": "storeAdd",	 	"value": 8},
		{"key": "wait",      	"value": 8},
	],
	upgrade: [
		{"key": "pickup",   	"value": 8},
		{"key": "storeGet",  	"value": 8},
		{"key": "upgrade",   	"value": 8},
		{"key": "harvest",   	"value": 8},
		{"key": "harvestFar",	"value": 8},
		{"key": "goHome",	 	"value": 8},
		{"key": "upgradeFallback","value": 8},
		{"key": "wall",   	 	"value": 8},
		{"key": "idle",      	"value": 8},
	],
	normal: [
		{"key": "pickup",   	"value": 8},
		{"key": "energize",  	"value": 8},
		{"key": "repairCritical","value": 8},
		{"key": "dismantle",    "value": 8},
		{"key": "build",     	"value": 8},
		{"key": "upgrade",   	"value": 8},
		{"key": "repair",    	"value": 8},
		{"key": "storeAdd",  	"value": 8},
		{"key": "harvest",   	"value": 8},
		{"key": "harvestFar",	"value": 8},
		{"key": "goHome",	 	"value": 8},
		{"key": "storeGet",  	"value": 8},
		{"key": "upgradeFallback","value": 8},
		{"key": "wall",   	 	"value": 8},
		{"key": "idle",      	"value": 8},
	],
	grow: [
		{"key": "energize",  	"value": 8},
		{"key": "repairCritical","value": 8},
		{"key": "dismantle",	"value": 8},
		{"key": "build",     	"value": 8},
		{"key": "pickup",   	"value": 8},
		{"key": "storeGet",  	"value": 8},
		{"key": "harvest",   	"value": 8},
		{"key": "harvestFar",	"value": 8},
		{"key": "storeAdd",	 	"value": 8},
		{"key": "idle",      	"value": 8},
	],
	recycle: [
		{"key": "energize",  	"value": 8},
		{"key": "storeAdd",  	"value": 8},
		{"key": "recycle",	 	"value": 8},
		{"key": "idle",  	 	"value": 8},
	],
	scout: [
		{"key": "scout",  	 	"value": 8},
		{"key": "idle",  	 	"value": 8},
	],
	reserve: [
		{"key": "reserve",   	"value": 8},
		{"key": "idle",      	"value": 8},
	],
	attackMelee: [
		{"key": "attackMelee",  "value": 80},
		{"key": "heal",    	 	"value": 80},
		{"key": "pickup",   	"value": 8},
		{"key": "storeAdd",  	"value": 8},
		{"key": "goHome",	 	"value": 8},
		{"key": "guardPost", 	"value": 8},
		{"key": "idle",  	 	"value": 8},
	],
	attackRanged: [
		{"key": "attackRanged", "value": 80},
		{"key": "heal",    	 	"value": 80},
		{"key": "pickup",   	"value": 8},
		{"key": "storeAdd",  	"value": 8},
		{"key": "goHome",	 	"value": 8},
		{"key": "guardPost", 	"value": 8},
		{"key": "idle",  	 	"value": 8},
	],
	heal: [
		{"key": "heal",    	 	"value": 80},
		{"key": "pickup",   	"value": 8},
		{"key": "storeAdd",  	"value": 8},
		{"key": "goHome",	 	"value": 8},
		{"key": "guardPost", 	"value": 8},
		{"key": "idle",  	 	"value": 8},
	],
}

Room.prototype.setTaskLimits = function() {
	this.memory.taskCount = {
		"attackMelee":  0,
		"attackRanged": 0,
		"heal": 		0,
		"pickup":    	0,
		"repairCritical": 0,
		"energize":   	0,
		"dismantle":   	0,
		"build":      	0,
		"repair":     	0,
		"wall":    	  	0,
		"harvest":    	0,
		"upgrade":    	0,
		"mine":    		0,
		"harvestFar": 	0,
		"goHome": 	  	0,
		"storeAdd":     0,
		"storeGet":   	0,
		"idle":       	0,
		"guardPost":    0,
		"scout":      	0,
		"reserve":      0,
		"upgradeFallback": 0,
		"recycle":    	0,
	}
	this.memory.taskMax = {
		"pickup":    	6,
		"repairCritical": 	4,
		"dismantle":   	6,
		"build":      	6,
		"repair":     	10,
		"wall":    	  	999,
		"harvest":    	6,
		"upgrade":    	2,
		"mine":    		2,
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
		"reserve":      999,
		"idle":      	999,
		"guardPost":    999,
		"recycle":    	999,
	}
	//console.log("DEBUG setTaskLimits: memory.taskCount="+this.memory.taskCount+" for "+this)
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
		"feed":		0,
		"haul":		0,
		"grow":		0,
		"recycle":	0,
		"scout":	0,
		"reserve":	0,
		"upgrade":	0,
		"mine":		0,
	}
	this.memory.jobMax = {
		"attackMelee":  2,
		"attackRanged": 2,
		"heal": 	1,
		"normal":	999,
		"feed":		4,
		"haul":		1,
		"grow":		999,
		"recycle":	999,
		"scout":	999,
		"reserve":	5,
		"upgrade":	0,
		"mine":		1,
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
		this.memory.priorities = Memory.defaultJobPriorities[this.memory.jobType || jobType]
	}else{
		this.memory.priorities = Memory.defaultJobPriorities[jobType || this.memory.jobType]
		//console.log("TRACE setJob: set priorities for "+this.name)
	}
	if (!this.memory.priorities){
		console.log("WARN setJob: "+this.name+" priorities="+this.memory.priorities+" jobType="+jobType+" this.memory.jobType="+this.memory.jobType)
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

Room.prototype.calculateJobMaximums = function(){
	let room = this	
	let storedEnergy = 0
	let storedSum = 0
	let storedCapacity = 0
	let storage = room.find(FIND_STRUCTURES, {filter: (t) => t.structureType == STRUCTURE_STORAGE})[0]
	if (storage){
		storedEnergy = storage.store[RESOURCE_ENERGY]
		storedSum = _.sum(storage.store)
		storedCapacity = storage.storeCapacity
	}
	
	let numWorkers = room.getNumWorkers()
	
	if (storedEnergy > 750000){
		let minerals = room.find(FIND_MINERALS)[0]
		if (minerals && minerals.mineralAmount > 500){
			let numExtractors = room.find(FIND_MY_STRUCTURES, {filter: (t) => t.structureType == STRUCTURE_EXTRACTOR} ).length
			room.setJobMax("mine", numExtractors)
		}
		/*
		if (taskDirector.tasks.getHaul.isValidTarget(taskDirector.tasks.getHaul.getTarget())){
			room.setJobMax("haul", 1)
		}else{
			room.setJobMax("haul", 0)
		}
		*/
	}else{
		room.setJobMax("mine", 0)
		room.setJobMax("haul", 0)
	}
	
	if (storedEnergy > 500000 && storedCapacity - storedSum < 5000){
		room.setJobMax("upgrade", 2)
	}else if (storedEnergy > 500000 && storedCapacity - storedSum < 100000){
		room.setJobMax("upgrade", 1)
	}else{
		room.setJobMax("upgrade", 0)
	}
	
		
	if (storedEnergy > 10000){
		room.setJobMax("feed", 2)
	}else{
		room.setJobMax("feed", 0)
	}
	
	if (room.controller.level < 8 && storedEnergy > 750000){
		/*
		let upgraders = Math.max(1, Math.floor(0.8*numWorkers * Math.pow(storedEnergy/1000000, 2)))
		log.trace("upgrade tasks = %s", upgraders, numWorkers, storedEnergy, storedCapacity)
		room.setTaskMax("upgrade", upgraders)
		*/
		room.setTaskMax("upgrade", 0.8*numWorkers)
	}else{
		room.setTaskMax("upgrade", 0)
	}
	
	let maxGuards = room.energyCapacityAvailable < 1800 && 2 || 1
	room.setJobMax("attackMelee", maxGuards)
	room.setJobMax("attackRanged", maxGuards)
	room.setJobMax("heal", maxGuards)
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
	if (!this.memory.jobMax) this.setJobLimits()
	return this.memory.jobMax[job]
}
	
Room.prototype.setJobMax = function(job, value) {
	if (!this.memory.jobMax) this.setJobLimits()
	this.memory.jobMax[job] = value	
}
