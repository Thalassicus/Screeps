let _ = require("lodash")
let task = require("prototype.task")
var tools = require("tools")
require("sprintf")
let log = require("logger")
log.setLevel(levelType.LEVEL_TRACE)

module.exports = {}

Memory.targetOf = Memory.targetOf || {}

RoomPosition.prototype.isBorder = function(){
	if (Game.map.getTerrainAt(this) == "wall") return false
	return (this.x == 0 || this.x == 49 || this.y == 0 || this.y == 49)
}

// =================================================================
// == TASK MANAGEMENT ==============================================
// =================================================================

taskActions:{
	
	Creep.prototype.doTask = function() {
		let task = this.getTask()
		if (!task) {
			this.setTask()
			task = this.getTask()
		}
		if (!task) {
			console.log("WARN: "+this.name+" cannot do task "+task)
			this.setTask()
			return -1
		}
		if (!module.exports.tasks[task].doTask) {
			console.log("ERROR: invalid task function for task:"+task)
			this.setTask()
			return -1
		}
		for (let taskInfo of this.memory.priorities){
			if (this.canInterruptForTask(taskInfo.key)){
				if (taskInfo.key != "pickup" && !(task == "upgradeFallback" && taskInfo.key == "upgrade")){
					console.log(sprintf("DEBUG doTask: %10s interrupts %s for %s in %s.", this.name, task, taskInfo.key, this.room))
				}
				this.setTask(taskInfo.key)
				return module.exports.tasks[taskInfo.key].doTask(this)
			}
		}
		let result = module.exports.tasks[task].doTask(this)
		if (!_.includes([OK, ERR_NOT_IN_RANGE, ERR_BUSY, ERR_NOT_FOUND], result)) {
			//log.trace("%s doTask %s result %s.", this.name, task, result)
		}
		return result
		//this.taskFunction[task](this)
		
	}

	module.exports.doTaskGeneric = function(person, task, functionCall){
		let target = Game.getObjectById(person.memory.targetID)
		if (!module.exports.tasks[task].isValidTarget(target)) {
			target = module.exports.tasks[task].getTarget(person)
			person.setTarget(target && target.id)
		}
		
		if (!module.exports.tasks[task].isValidTarget(target)) {
			person.setTarget(null)
			return ERR_NOT_FOUND
		}
		
		let result = person[functionCall](target)
		if (person.pos.isBorder() || result == ERR_NOT_IN_RANGE) {
			person.moveTo(target)
		} else if (result != OK) {
			person.setTarget(null)
		}
		return result
	}

	Creep.prototype.canStartTask = function(task){
		if (this.room.getTaskCount(task) >= this.room.getTaskMax(task)) {
			return false
		}
		if (module.exports.tasks[task] == undefined) {
			console.log("DEBUG: module.exports["+task+"] is undefined!")
			return false
		}
		return module.exports.tasks[task].canStart(this)
	}

	Creep.prototype.canContinueTask = function(task){
		if (task==undefined) {
			task = this.getTask()
		}
		if (module.exports.tasks[task] == undefined) {
			console.log("DEBUG taskDirector: module.exports["+task+"] is undefined!")
			return false
		}
		return module.exports.tasks[task].canContinue(this)
	}

	Creep.prototype.canInterruptForTask = function(task){
		if (this.getTask() == task) return false
		if (!module.exports.tasks[this.getTask()].canInterruptThis) return false
		if (this.room.getTaskCount(task) >= this.room.getTaskMax(task)) return false
		
		if (module.exports.tasks[task] == undefined) {
			console.log("DEBUG: module.exports["+task+"] is undefined!")
			return false
		}
		if (module.exports.tasks[task].canInterruptOthers == undefined){
			console.log("DEBUG: canInterruptOthers is undefined for task "+task+"!")
			return false
		}
		return module.exports.tasks[task].canInterruptOthers(this)
	}

	module.exports.isValidTargetGeneric = function(target){
		return (target && typeof target == "object")
	}

}

taskManagement: {

	Creep.prototype.setTarget = function(targetID){
		module.exports.setTarget(this.name, targetID)
	}

	module.exports.setTarget = function(personName, newTargetID){
		let targetArray = Memory.targetOf[Memory.creeps[personName].targetID]
		let person = Game.creeps[personName]
		if (targetArray){
			_.pull(targetArray, Memory.creeps[personName].task)
			if (targetArray.length == 0) {
				delete Memory.targetOf[Memory.creeps[personName].targetID]
			}else{
				Memory.targetOf[Memory.creeps[personName].targetID] = targetArray
			}
		}
		if (newTargetID){
			Memory.targetOf[newTargetID] = Memory.targetOf[newTargetID] || []
			Memory.targetOf[newTargetID].push(Memory.creeps[personName].task)
			if (Memory.creeps[personName].task == "harvestFar" || (person && person.task == "harvest" && person.room != person.memory.homeRoom)){
				Memory.sources[newTargetID].numHarvesters += 1
			}
		}else{
			if (Memory.creeps[personName].task == "harvestFar" || (person && person.task == "harvest" && person.room != person.memory.homeRoom)){
				let oldTargetID = Memory.creeps[personName].targetID
				let oldTarget = Game.getObjectById(oldTargetID)
				if (Memory.sources[oldTargetID]){
					Memory.sources[oldTargetID].numHarvesters = Math.max(0, Memory.sources[oldTargetID].numHarvesters - 1)
				}else{
					/*
					This seems to occur when taskCount exceeds taskMax in rooms outside the home room,
					such as when "repair" taskMax is 2 while more than 2 people try to repair a Container.
					*/
					//log.debug("%s setTarget harvestFar oldTarget=%s in room %s", personName, oldTarget, oldTarget && oldTarget.room)
				}
			}
		}
		Memory.creeps[personName].targetID = newTargetID
	}

	module.exports.isTargetedFor = function(targetID, task){
		return Memory.targetOf[targetID] && _.includes(Memory.targetOf[targetID], task)
	}

	Creep.prototype.getTask = function(){
		if (!this.memory.task){
			console.log("WARN getTask: "+this.name+" task is "+this.memory.task+".")
			//this.setTask()
		}
		return this.memory.task
	}

	Creep.prototype.setTask = function(forceTask) {
		let person = this
		if (person.memory.task == undefined){
			person.memory.task = "idle"
			person.room.changeTaskCount("idle", 1)
		}
		if (person.memory.priorities == undefined) {
			person.setJob("normal")
			return
		}
		
		let oldTask = person.memory.task
		if (oldTask && person.memory.priorities.length <= 1) {
			return oldTask
		}
		
		let task = forceTask
		if (task == undefined){
			if (oldTask == "harvest" && person.room.memory.numHostiles == 0 && !person.room.memory.isGrowing && person.canStartTask("storeAdd")) {
				task = "storeAdd"
			} else {
				for (let taskInfo of person.memory.priorities){
					if (person.canStartTask(taskInfo.key)){
						task = taskInfo.key
						break
					}
				}
			}
		}
		
		if (!task) {
			console.log("ERROR setTask: No valid task for "+person.name+".")
			return ERR_NOT_FOUND
		}
		
		let sayString = module.exports.tasks[task].say
		if (sayString){
			person.say(sayString, true)
		}
		
		let homeRoom = Game.rooms[person.memory.homeRoomName]
		if (module.exports.tasks[task].useHomeRoom){
			homeRoom.changeTaskCount(task, 1)
		}else{
			person.room.changeTaskCount(task, 1)
		}
		
		if (!_.includes(["guardPost","idle","scout"], task)) {
			//console.log("TRACE: " + person.room.getTaskCount(task) + "/" + person.room.getTaskMax(task) + " people doing " + task + " (current task: " + person.getTask() + ")")
		}
		if (oldTask) {
			//if (oldTask == "storeGet") console.log(Game.time+" "+person.name+" say storeGet")
			if (module.exports.tasks[oldTask].useHomeRoom){
				homeRoom.unassignTask(person.name, oldTask)
			} else {
				person.room.unassignTask(person.name, oldTask)
			}
		}
		
		person.memory.task = task
		person.setTarget(null)
		
		return task
	}

	Room.prototype.unassignTask = function(personName, task) {
		this.changeTaskCount(task, -1)
		//if (task != "idle") log.debug("Unassign %s from %s.", task, personName)
		module.exports.setTarget(personName, null)
		/*
		if (task == "harvestFar"){
			let target = Game.getObjectById(targetID)
			if (typeof target == "object" && Memory.sources[targetID]) {
				Memory.sources[targetID].numHarvesters = Math.max(0, Memory.sources[targetID].numHarvesters - 1)
				Memory.creeps[personName].targetID = null
			}
		}
		*/
	}

	Room.prototype.unassignJob = function(personName, job) {
		this.changeJobCount(job, -1)
	}

}

taskTracking: {
	
	Room.prototype.getTaskCount = function(task) {
		if (!this.memory.taskCount) this.setTaskLimits()
		return this.find(FIND_MY_CREEPS, {filter: (t) => t.getTask() == task}).length
		//return this.memory.taskCount[task]
	}
		
	Room.prototype.setTaskCount = function(task, value) {
		if (!this.memory.taskCount) this.setTaskLimits()
		this.memory.taskCount[task] = value
	}

	Room.prototype.changeTaskCount = function(task, value) {
		if (!this.memory.taskCount) this.setTaskLimits()
		this.memory.taskCount[task] += value
	}

	Room.prototype.getTaskMax = function(task) {
		if (!this.memory.taskCount) this.setTaskLimits()
		return this.memory.taskMax[task]
	}
		
	Room.prototype.setTaskMax = function(task, value) {
		if (!this.memory.taskCount) this.setTaskLimits()
		this.memory.taskMax[task] = value	
	}
		
	Room.prototype.changeTaskMax = function(task, value) {
		if (!this.memory.taskCount) this.setTaskLimits()
		this.memory.taskMax[task] += value
	}

}

module.exports.tasks = {}

// =================================================================
// == HOSTILE =======================================================
// =================================================================

// Attack
module.exports.canInterruptOthersToAttack = function(person){
	return (this.canStart(person))
}
module.exports.canStartAttack = function(person) {
	return this.canContinue(person)
}
module.exports.canContinueAttack = function(person) {
	if (person.getActiveBodyparts(ATTACK) == 0) return false
	for (roomName in Memory.scouts){ // only defend rooms with active scouts
		let room = Memory.rooms[roomName]
		if (room && room.numHostiles > 0){
			return true
		}
	}
	return false
}
module.exports.doAttack = function(person) {
	let target = this.getTarget(person)
	if (!target) {
		return false
	}
	
	let result = person.attack(target)
	person.moveTo(target)
	
	//if (result != 
	//console.log("DEBUG: "+person.name+" attacking "+target+" with result "+result+".")
	return result || false
}
module.exports.getTargetToAttack = function(person) {
	let target
	if (person.room.memory.numHostiles > 0) {
		target = person.pos.findClosestByPath(FIND_HOSTILE_CREEPS)
	}else{
		target = Game.getObjectById(Memory.hostiles[0])
	}
	
	if (target) return target
	
	for (roomName in Memory.rooms){
		//console.log("DEBUG: "+roomName+" has "+Memory.rooms[roomName].numHostiles+" hostiles.")
		if (Memory.rooms[roomName].numHostiles > 0){
			target = tools.findCenterOfRoom(roomName)
			return target
		}
	}
	return ERR_NOT_FOUND
	
}
module.exports.tasks.attackMelee = {
	type:				"attack",
	weight:				10,
	say:				"⚔",
	useHomeRoom:		false,
	canInterruptOthers:	module.exports.canInterruptOthersToAttack,
	canStart:			module.exports.canStartAttack,
	canContinue:		module.exports.canContinueAttack,
	doTask:				module.exports.doAttack,
	getTarget:			module.exports.getTargetToAttack,
	isValidTarget:		module.exports.isValidTargetGeneric,
}

// AttackRanged
module.exports.canInterruptOthersToAttackRanged = function(person){
	return (this.canStart(person))
}
module.exports.canStartAttackRanged = function(person) {
	return this.canContinue(person)
}
module.exports.canContinueAttackRanged = function(person) {
	if (person.getActiveBodyparts(RANGED_ATTACK) == 0) return false
	for (roomName in Memory.scouts){ // only defend rooms with active scouts
		let room = Memory.rooms[roomName]
		if (room && room.numHostiles > 0){
			return true
		}
	}
	return false
}
module.exports.doAttackRanged = function(person) {
	let target = Game.getObjectById(person.memory.targetID)
	if (!this.isValidTarget(target)) {
		target = this.getTarget(person)
		person.setTarget(target && target.id)
	}
	
	if (!this.isValidTarget(target)) {
		person.setTarget(null)
		return ERR_NOT_FOUND
	}
	
	let result = person.rangedAttack(target)
	person.moveTo(target)
	
	//console.log("DEBUG: "+person.name+" attacking "+target+" with result "+result+".")
	return result || false
}
module.exports.getTargetToAttackRanged = function(person) {
	return module.exports.getTargetToAttack(person)
}
module.exports.tasks.attackRanged = {
	type:				"attackRanged",
	weight:				10,
	say:				"⚔",
	useHomeRoom:		false,
	canInterruptOthers:	module.exports.canInterruptOthersToAttackRanged,
	canStart:			module.exports.canStartAttackRanged,
	canContinue:		module.exports.canContinueAttackRanged,
	doTask:				module.exports.doAttackRanged,
	getTarget:			module.exports.getTargetToAttackRanged,
	isValidTarget:		module.exports.isValidTargetGeneric,
}

// Heal
module.exports.canInterruptOthersToHeal = function(person){
	return (this.canStart(person))
}
module.exports.canStartHeal = function(person) {
	return this.canContinue(person)
}
module.exports.canContinueHeal = function(person) {
	if (person.getActiveBodyparts(HEAL) == 0) return false
	return this.isValidTarget(this.getTarget(person))
}
module.exports.doHeal = function(person) {
	//return module.exports.doTaskGeneric(person, this.getTarget(person), person.heal)
	let target = this.getTarget(person)
	if (!target == undefined) return ERR_NOT_FOUND
	
	let result = person.heal(target)
	if (result == ERR_NOT_IN_RANGE) {
		result = person.rangedHeal(target)
	}
	person.moveTo(target)
	return result
}
module.exports.getTargetToHeal = function(person) {
	for (let personName in Game.creeps){
		let person = Game.creeps[personName]
		if (person.hits < person.hitsMax){
			return person
		}
	}
	return false
}
module.exports.tasks.heal = {
	type:				"heal",
	weight:				10,
	say:				"⚔",
	useHomeRoom:		false,
	canInterruptOthers:	module.exports.canInterruptOthersToHeal,
	canStart:			module.exports.canStartHeal,
	canContinue:		module.exports.canContinueHeal,
	doTask:				module.exports.doHeal,
	getTarget:			module.exports.getTargetToHeal,
	isValidTarget:		module.exports.isValidTargetGeneric,
}

// GuardPost
module.exports.canInterruptOthersToGuardPost = function(person){
	return false
}
module.exports.canStartGuardPost = function(person) {
	return Game.flags.Guard1
}
module.exports.canContinueGuardPost = function(person) {
	return Game.flags.Guard1
}
module.exports.doGuardPost = function(person) {
	let target = Game.getObjectById(person.memory.targetID)
	if (!this.isValidTarget(target)) {
		target = this.getTarget(person)
		person.setTarget(target && target.id)
	}
	
	if (!this.isValidTarget(target)) {
		console.log("TRACE doGuardPost: Could not find Guard1 flag.")
		person.setTarget(null)
		return ERR_NOT_FOUND
	}
	
	let range = person.pos.getRangeTo(target)
	if(person.pos.isBorder() || range == Infinity || range > 1) {
		person.moveTo(target)
	}
	return OK
}
module.exports.getTargetToGuardPost = function(person) {
	return Game.flags.Guard1
}
module.exports.tasks.guardPost = {
	type:				"guardPost",
	weight:				10,
	say:				"★",
	useHomeRoom:		false,
	canInterruptThis:	true,
	canInterruptOthers:	module.exports.canInterruptOthersToGuardPost,
	canStart:			module.exports.canStartGuardPost,
	canContinue:		module.exports.canContinueGuardPost,
	doTask:				module.exports.doGuardPost,
	getTarget:			module.exports.getTargetToGuardPost,
	isValidTarget:		module.exports.isValidTargetGeneric,
}






// =================================================================
// == WORK =========================================================
// =================================================================

// Build
module.exports.canInterruptOthersToBuild = function(person){
	return (person.ticksToLive % 10 == 0 && this.canStart(person))
}
module.exports.canStartBuild = function(person) {
	return this.canContinue(person)
}
module.exports.canContinueBuild = function(person) {
	if (person.carry.energy <= 0) return false
	if (person.room.memory.numHostiles > 0) return false
	return (person.room.find(FIND_CONSTRUCTION_SITES).length > 0)
}
module.exports.doBuild = function(person) {
		return module.exports.doTaskGeneric(person, this.type, "build")
		/*
	let target = Game.getObjectById(person.memory.targetID)
	if (!this.isValidTarget(target)) {
		target = this.getTarget(person)
		person.setTarget(target && target.id)
	}
	
	if (!this.isValidTarget(target)) {
		person.setTarget(null)
		return ERR_NOT_FOUND
	}
	
	let result = person.build(target)
	if (person.pos.isBorder() || result == ERR_NOT_IN_RANGE) {
		person.moveTo(target)
	} else if (result != OK) {
		person.setTarget(null)
	}
	return OK
	*/
}
module.exports.getTargetToBuild = function(person) {
	return person.pos.findClosestByPath(FIND_CONSTRUCTION_SITES)
}
module.exports.tasks.build = {
	type:				"build",
	weight:				10,
	say:				"🔨",
	useHomeRoom:		false,
	canInterruptThis:	false,
	canInterruptOthers:	module.exports.canInterruptOthersToBuild,
	canStart:			module.exports.canStartBuild,
	canContinue:		module.exports.canContinueBuild,
	doTask:				module.exports.doBuild,
	getTarget:			module.exports.getTargetToBuild,
	isValidTarget:		module.exports.isValidTargetGeneric,
}

// Mine
module.exports.canInterruptOthersToMine = function(person){
	return false
}
module.exports.canStartMine = function(person) {
	return this.canContinue(person)
}
module.exports.canContinueMine = function(person) {
	if (_.sum(person.carry) >= person.carryCapacity) return false
	if (person.ticksToLive < 90) return false
	return this.isValidTarget(this.getTarget(person))
}
module.exports.doMine = function(person) {
		return module.exports.doTaskGeneric(person, this.type, "harvest")
		/*
	let target = Game.getObjectById(person.memory.targetID)
	if (!this.isValidTarget(target)) {
		target = this.getTarget(person)
		person.setTarget(target && target.id)
	}
	
	if (!this.isValidTarget(target)) {
		person.setTarget(null)
		return ERR_NOT_FOUND
	}
		
	let result = person.harvest(target)
	if (person.pos.isBorder() || result == ERR_NOT_IN_RANGE) {
		person.moveTo(target)
	} else if (result != OK) {
		person.setTarget(null)
	}
	//log.debug(result)
	return result
	*/
}
module.exports.getTargetToMine = function(person) {
	let targets = person.room.find(FIND_MINERALS)
	if (!targets[0]) return ERR_NOT_FOUND
	
	let extractor = Game.getObjectById(person.room.memory.extractorID)
	if (!extractor){
		extractor = person.room.find(FIND_STRUCTURES, {filter: (t) => t.structureType == STRUCTURE_EXTRACTOR} )[0]
		if (!extractor) return ERR_NOT_FOUND
		person.room.memory.extractorID = extractor.id
	}
	if (extractor.cooldown == 0){
		return targets[0]
	}
	
	return ERR_NOT_FOUND
}
module.exports.tasks.mine = {
	type:				"mine",
	weight:				10,
	say:				"⛏",
	useHomeRoom:		false,
	canInterruptThis:	false,
	canInterruptOthers:	module.exports.canInterruptOthersToMine,
	canStart:			module.exports.canStartMine,
	canContinue:		module.exports.canContinueMine,
	doTask:				module.exports.doMine,
	getTarget:			module.exports.getTargetToMine,
	isValidTarget:		module.exports.isValidTargetGeneric,
}

module.exports.tasks.harvest = {
	type:				"harvest",
	weight:				10,
	say:				"⛏",
	useHomeRoom:		false,
	canInterruptThis:	false,
	
	canInterruptOthers: function(person){
		return false
	},
	
	canStart: function(person) {
		// Should we energize from storage?
		if (person.room.getJobCount("feed") == 0
				&& person.canStartTask("storeGet")
				&& person.room.getTaskCount("energize") < person.room.getTaskMax("energize")){
			if (person.room.find(FIND_STRUCTURES, {filter: (t) => 
						(t.structureType == STRUCTURE_EXTENSION || t.structureType == STRUCTURE_SPAWN)
						&& t.energy < t.energyCapacity
					}).length > 0){
				console.log("TRACE: do not harvest (energize spawns)")
				return false
			}
			if (person.room.find(FIND_STRUCTURES, {filter: (t) => 
						(t.structureType == STRUCTURE_TOWER)
						&& t.energy < 0.55 * t.energyCapacity
					}).length > 0){
				//console.log("TRACE: do not harvest (energize tower)")
				return false
			}
		}
		
		// Should we build from storage?
		if (person.room.find(FIND_CONSTRUCTION_SITES).length > 0 && person.room.getTaskCount("build") < person.room.getTaskMax("build")){
			if (person.room.find(FIND_STRUCTURES, {filter: (t) =>
					   t.structureType == STRUCTURE_STORAGE
					&& t.store[RESOURCE_ENERGY] > 2000
					}).length > 0){
				//console.log("TRACE: do not harvest (build from storage)")
				return false
			}
		}
		return this.canContinue(person)

	},
	
	canContinue: function(person) {
		if (_.sum(person.carry) >= person.carryCapacity) return false
		if (person.room.name != person.memory.homeRoomName && person.ticksToLive < 90) {
			//console.log("TRACE: "+person.name+" stop harvest in "+person.room+" (retire to home)")
			return false
		}
		
		return person.pos.findClosestByPath(FIND_SOURCES_ACTIVE)
	},
		
	doTask: function(person) {
		return module.exports.doTaskGeneric(person, this.type, this.type)
	},
	
	getTarget: function(person) {
		return person.pos.findClosestByPath(FIND_SOURCES_ACTIVE)
	},
	
	isValidTarget: function(target, person) {
		if (!module.exports.isValidTargetGeneric(target)) return false
		if (!target.energy || target.energy == 0) return false
		return true
	},
}

// HarvestFar
module.exports.canInterruptOthersToHarvestFar = function(person){
	return false
}
module.exports.canStartHarvestFar = function(person) {
	// Should we energize from storage?
	if (person.room.getJobCount("feed") == 0
			&& person.canStartTask("storeGet")
			&& person.room.getTaskCount("energize") < person.room.getTaskMax("energize")){
		if (person.room.find(FIND_STRUCTURES, {filter: (t) => 
					(t.structureType == STRUCTURE_EXTENSION || t.structureType == STRUCTURE_SPAWN)
					&& t.energy < t.energyCapacity
				}).length > 0){
			console.log("TRACE: do not harvestFar (energize spawns)")
			return false
		}
		if (person.room.find(FIND_STRUCTURES, {filter: (t) => 
					(t.structureType == STRUCTURE_TOWER)
					&& t.energy < 0.55 * t.energyCapacity
				}).length > 0){
			//console.log("TRACE: do not harvestFar (energize tower)")
			return false
		}
	}
	
	// Should we build from storage?
	if (person.room.find(FIND_CONSTRUCTION_SITES).length > 0 && person.room.getTaskCount("build") < person.room.getTaskMax("build")){
		if (person.room.find(FIND_STRUCTURES, {filter: (t) =>
				   t.structureType == STRUCTURE_STORAGE
				&& t.store
				&& t.store[RESOURCE_ENERGY] > 0.25 * t.storeCapacity
				}).length > 0){
			return false
		}
	}
	let openSpots = false
	for (let sourceID in Memory.sources){
		if (!Game.getObjectById(sourceID)) return
		if (Game.getObjectById(sourceID).energy > 0 && (Memory.sources[sourceID].numHarvesters < Memory.sources[sourceID].maxHarvesters)) {
			openSpots = true
			break
		}
	}
	if (!openSpots) {
		console.log("DEBUG: No available sources to "+this.type+" with "+person+".")
		return false
	}
	return this.canContinue(person)
}
module.exports.canContinueHarvestFar = function(person) {
	//return false
	let homeRoom = Game.rooms[person.memory.homeRoomName]
	if (homeRoom.memory.isGrowing) {
		//console.log("TRACE: "+person.name+" stop harvestFar in "+person.room+" (under attack)")
		return false
	}
	if (person.room.memory.numHostiles > 0) {
		//console.log("TRACE: "+person.name+" stop harvestFar in "+person.room+" (under attack)")
		return false
	}
	if (_.sum(person.carry) >= person.carryCapacity) {
		//console.log("TRACE: "+person.name+" stop harvestFar in "+person.room+" (at capacity)")
		return false
	}
	if (person.ticksToLive < 90) {
		//console.log("TRACE: "+person.name+" stop harvestFar in "+person.room+" (retire to home)")
		return false
	}
	return this.isValidTarget(Game.getObjectById(person.memory.targetID)) || this.isValidTarget(this.getTarget(person))
}
module.exports.doHarvestFar = function(person) {
	let target = Game.getObjectById(person.memory.targetID)
	if (!this.isValidTarget(target, person)) {
		target = this.getTarget(person)
		person.setTarget(target && target.id)
	}
	
	//console.log("TRACE: "+person.name+" in "+person.room+" harvestFar at "+target+" target.room:"+target.room+" range:"+person.pos.getRangeTo(target))
	
	if (!this.isValidTarget(target, person)) {
		person.setTarget(null)
		return ERR_NOT_FOUND
	}
	
	let result = person.harvest(target)
		
	if (person.pos.isBorder() || result == ERR_NOT_IN_RANGE) {
		person.moveTo(target)
	} else if (result != OK) {
		person.setTarget(null)
	}
	return result
}
module.exports.getTargetToHarvestFar = function(person) {
	for (let sourceID in Memory.sources){
		let source = Game.getObjectById(sourceID)
		if (this.isValidTarget(source)){
			return source
		}
	}
}
module.exports.isValidTargetToHarvestFar = function(target, person) {
	if (!module.exports.isValidTargetGeneric(target)) return false
	if (!target.energy || target.energy == 0) return false
	if (person) return true
	let source = Memory.sources[target.id]
	return source && source.numHarvesters < source.maxHarvesters
}
module.exports.tasks.harvestFar = {
	type:				"harvestFar",
	weight:				10,
	say:				"⛏...",
	useHomeRoom:		true,
	canInterruptThis:	false,
	canInterruptOthers:	module.exports.canInterruptOthersToHarvestFar,
	canStart:			module.exports.canStartHarvestFar,
	canContinue:		module.exports.canContinueHarvestFar,
	doTask:				module.exports.doHarvestFar,
	getTarget:			module.exports.getTargetToHarvestFar,
	isValidTarget:		module.exports.isValidTargetToHarvestFar,
}

// Repair
module.exports.canInterruptOthersToRepair = function(person){
	return (person.ticksToLive % 10 == 0 && this.canStart(person))
}
module.exports.canStartRepair = function(person) {
	if (person.room.find(FIND_MY_STRUCTURES, {filter: {structureType: STRUCTURE_TOWER}}).length > 0){
		if (!person.room.memory.isGrowing) return false // towers available
	}
	return this.canContinue(person)
}
module.exports.canContinueRepair = function(person) {
	if (person.carry.energy <= 0) return false
	return this.isValidTarget(this.getTarget(person))
}
module.exports.doRepair = function(person) {
		return module.exports.doTaskGeneric(person, this.type, "repair")
		/*
	let target = Game.getObjectById(person.memory.targetID)
	if (!this.isValidTarget(target)) {
		target = this.getTarget(person)
		person.setTarget(target && target.id)
	}
	
	if (!this.isValidTarget(target)) {
		person.setTarget(null)
		return ERR_NOT_FOUND
	}
	
	let result = person.repair(target)
	if (person.pos.isBorder() || result == ERR_NOT_IN_RANGE) {
		person.moveTo(target)
	} else if (result != OK) {
		person.setTarget(null)
	}
	return result
	*/
}
module.exports.getTargetToRepair = function(person) {
	return person.pos.findClosestByPath(FIND_STRUCTURES, {filter: (t) =>
		   t.hits < t.hitsMax - Math.min(50, 0.5*person.carry.energy)
		&& t.structureType != STRUCTURE_WALL
		&& t.structureType != STRUCTURE_RAMPART
	})
}
module.exports.isValidTargetToRepair = function(target, person) {
	if (!module.exports.isValidTargetGeneric(target)) return false
	if (!target.hits || target.hits == target.hitsMax) return false
	return true
}
module.exports.tasks.repair = {
	type:				"repair",
	weight:				10,
	say:				"🔨+",
	useHomeRoom:		false,
	canInterruptThis:	true,
	canInterruptOthers:	module.exports.canInterruptOthersToRepair,
	canStart:			module.exports.canStartRepair,
	canContinue:		module.exports.canContinueRepair,
	doTask:				module.exports.doRepair,
	getTarget:			module.exports.getTargetToRepair,
	isValidTarget:		module.exports.isValidTargetToRepair,
}

// RepairCritical
module.exports.canInterruptOthersToRepairCritical = function(person){
	return (person.ticksToLive % 10 == 0 && this.canStart(person))
}
module.exports.canStartRepairCritical = function(person) {
	return this.canContinue(person)
}
module.exports.canContinueRepairCritical = function(person) {
	if (person.carry.energy <= 0) return false
	return this.isValidTarget(this.getTarget(person))
}
module.exports.doRepairCritical = function(person) {
		return module.exports.doTaskGeneric(person, this.type, "repair")
		/*
	let target = Game.getObjectById(person.memory.targetID)
	if (!this.isValidTarget(target)) {
		target = this.getTarget(person)
		person.setTarget(target && target.id)
	}
	
	if (!this.isValidTarget(target)) {
		person.setTarget(null)
		return ERR_NOT_FOUND
	}
	
	let result = person.repair(target)
	if (person.pos.isBorder() || result == ERR_NOT_IN_RANGE) {
		person.moveTo(target)
	} else if (result != OK) {
		person.setTarget(null)
	}
	return result
	*/
}
module.exports.getTargetToRepairCritical = function(person) {
	return person.pos.findClosestByPath(FIND_STRUCTURES, {filter: (t) =>
		   t.hits < Math.min(5000, 0.05 * t.hitsMax)
		&& t.structureType != STRUCTURE_WALL
	})
}
module.exports.isValidTargetToRepair = function(target, person) {
	if (!module.exports.isValidTargetGeneric(target)) return false
	if (!target.hits || target.hits == target.hitsMax) return false
	return true
}
module.exports.tasks.repairCritical = {
	type:				"repairCritical",
	weight:				10,
	say:				"🔨!",
	useHomeRoom:		false,
	canInterruptThis:	true,
	canInterruptOthers:	module.exports.canInterruptOthersToRepairCritical,
	canStart:			module.exports.canStartRepairCritical,
	canContinue:		module.exports.canContinueRepairCritical,
	doTask:				module.exports.doRepairCritical,
	getTarget:			module.exports.getTargetToRepairCritical,
	isValidTarget:		module.exports.isValidTargetToRepair,
}

// Upgrade
module.exports.canInterruptOthersToUpgrade = function(person){
	return (person.ticksToLive % 10 == 0 && this.canStart(person))
}
module.exports.canStartUpgrade = function(person) {
	return this.canContinue(person)

}
module.exports.canContinueUpgrade = function(person) {
	return person.carry.energy > 0 && person.room.controller.my
}
module.exports.doUpgrade = function(person) {
		return module.exports.doTaskGeneric(person, this.type, "upgradeController")
		/*
	let room = Game.rooms[person.memory.homeRoomName]
	let target = room.controller
	
	if (!this.isValidTarget(target)) {
		person.setTarget(null)
		return ERR_NOT_FOUND
	}

	let result = person.upgradeController(target)
	if (person.pos.isBorder() || result == ERR_NOT_IN_RANGE) {
		person.moveTo(target)
	} else if (result != OK) {
		person.setTarget(null)
	}
	return result
	*/
}
module.exports.getTargetToUpgrade = function(person) {
	return person.room.controller
}
module.exports.tasks.upgrade = {
	type:				"upgrade",
	weight:				10,
	say:				"◐",
	useHomeRoom:		false,
	canInterruptThis:	false,
	canInterruptOthers:	module.exports.canInterruptOthersToUpgrade,
	canStart:			module.exports.canStartUpgrade,
	canContinue:		module.exports.canContinueUpgrade,
	doTask:				module.exports.doUpgrade,
	getTarget:			module.exports.getTargetToUpgrade,
	isValidTarget:		module.exports.isValidTargetGeneric,
}

// UpgradeFallback
module.exports.canInterruptOthersToUpgradeFallback = function(person){
	
}
module.exports.canStartUpgradeFallback = function(person) {
	return this.canContinue(person)
}
module.exports.canContinueUpgradeFallback = function(person) {
	return module.exports.canContinueUpgrade(person)
}
module.exports.doUpgradeFallback = function(person) {
		return module.exports.doTaskGeneric(person, this.type, "upgradeController")
		/*
	let room = Game.rooms[person.memory.homeRoomName]
	let target = room.controller
	
	if (!this.isValidTarget(target)) {
		person.setTarget(null)
		return ERR_NOT_FOUND
	}

	let result = person.upgradeController(target)
	if (person.pos.isBorder() || result == ERR_NOT_IN_RANGE) {
		person.moveTo(target)
	} else if (result != OK) {
		person.setTarget(null)
	}
	return result
	*/
}
module.exports.getTargetToUpgradeFallback = function(person) {
	return person.room.controller
}
module.exports.tasks.upgradeFallback = {
	type:				"upgradeFallback",
	weight:				10,
	say:				"◐?",
	useHomeRoom:		false,
	canInterruptThis:	true,
	canInterruptOthers:	module.exports.canInterruptOthersToUpgradeFallback,
	canStart:			module.exports.canStartUpgradeFallback,
	canContinue:		module.exports.canContinueUpgradeFallback,
	doTask:				module.exports.doUpgradeFallback,
	getTarget:			module.exports.getTargetToUpgradeFallback,
	isValidTarget:		module.exports.isValidTargetGeneric,
}

// Wall
module.exports.canInterruptOthersToWall = function(person){
	return false
}
module.exports.canStartWall = function(person) {
	return this.canContinue(person)
}
module.exports.canContinueWall = function(person) {
	if (person.carry.energy <= 0) return false
	if (person.room.memory.numHostiles > 0) return false
	return person.room.find(FIND_STRUCTURES, {filter: (t) =>
		   t.hits < t.hitsMax//person.room.getWallMax()
		&& (t.structureType == STRUCTURE_WALL || t.structureType == STRUCTURE_RAMPART)
	}).length > 0
}
module.exports.doWall = function(person) {
	let room = Game.rooms[person.memory.homeRoomName]
	let target = person.pos.findClosestByPath(FIND_STRUCTURES, {filter: (t) =>
		   t.hits < t.hitsMax//person.room.getWallMax()
		&& (t.structureType == STRUCTURE_WALL || t.structureType == STRUCTURE_RAMPART)
	})
	
	if (!this.isValidTarget(target)) {
		person.setTarget(null)
		return ERR_NOT_FOUND
	}
	
	let result = person.repair(target)
	if (person.pos.isBorder() || result == ERR_NOT_IN_RANGE) {
		person.moveTo(target)
	} else if (result != OK) {
		person.setTarget(null)
	}
	return result
}
module.exports.getTargetToWall = function(person) {

}
module.exports.tasks.wall = {
	type:				"wall",
	weight:				10,
	say:				"♜",
	useHomeRoom:		false,
	canInterruptThis:	true,
	canInterruptOthers:	module.exports.canInterruptOthersToWall,
	canStart:			module.exports.canStartWall,
	canContinue:		module.exports.canContinueWall,
	doTask:				module.exports.doWall,
	getTarget:			module.exports.getTargetToWall,
	isValidTarget:		module.exports.isValidTargetGeneric,
}






// =================================================================
// == CARRY ========================================================
// =================================================================

// Energize
module.exports.canInterruptOthersToEnergize = function(person){
	return (person.ticksToLive % 10 == 0 && this.canStart(person))
}
module.exports.canStartEnergize = function(person) {
	//if (person.room.name != person.memory.homeRoomName) return false
	//log.debug("canStartEnergize %s", person.name)
	if (person.room.memory.numHostiles == 0
			&& person.getJob() != "grow"
			&& person.getJob() != "feed"
			&& person.room.getJobCount("feed") > 0) {
		//log.debug("false (A) %s %s %s %s", !person.room.memory.isGrowing, person.room.memory.numHostiles, person.getJob(), person.room.getJobCount("feed"))
		return false
	}
	return this.canContinue(person)
}
module.exports.canContinueEnergize = function(person) {
	//log.debug("canContinueEnergize %s", person.name)
	if (person.carry.energy <= 0) {
		//log.debug("false (B)")
		return false
	}
	if (person.room.find(FIND_STRUCTURES, {filter: (t) => 
			   (t.structureType == STRUCTURE_EXTENSION || t.structureType == STRUCTURE_SPAWN)
			&& t.energy < t.energyCapacity
			}).length > 0){
		//log.debug("true (C)")
		return true
	}
	if (person.room.find(FIND_STRUCTURES, {filter: (t) => 
			   (t.structureType == STRUCTURE_TOWER)
			&& t.energy < t.energyCapacity - Math.min(50, 0.5*person.carry.energy)
			}).length > 0){
		return true
	}
	//log.debug("false (d)")
	return false
}
module.exports.doEnergize = function(person) {
	let target = Game.getObjectById(person.memory.targetID)
	if (!this.isValidTarget(target)) {
		target = this.getTarget(person)
		person.setTarget(target && target.id)
	}
	
	if (!this.isValidTarget(target)) {
		person.setTarget(null)
		return ERR_NOT_FOUND
	}
	
	let result = person.transfer(target, RESOURCE_ENERGY)
	if (person.pos.isBorder() || result == ERR_NOT_IN_RANGE) {
		person.moveTo(target)
	}
	if (result == OK){
		target = this.getTarget(person)
		person.setTarget(target && target.id)
		if (this.isValidTarget(target)) {
			person.moveTo(target)
		}
	}
	return result
}
module.exports.getTargetToEnergize = function(person) {
	//let room = Game.rooms[person.memory.homeRoomName]
	let target
	
	// very low towers
	if (!target) target = person.pos.findClosestByPath(FIND_STRUCTURES, { filter: (t) =>
		   (t.structureType == STRUCTURE_TOWER)
		&& t.energy < 0.25 * t.energyCapacity
		&& !_.includes(Memory.targetOf[t.id], this.type)
	})
	
	// low towers
	if (!target) target = person.pos.findClosestByPath(FIND_STRUCTURES, { filter: (t) =>
		   (t.structureType == STRUCTURE_TOWER)
		&& t.energy < 0.6 * t.energyCapacity
		&& person.carry.energy >= t.energyCapacity - t.energy
		&& !_.includes(Memory.targetOf[t.id], this.type)
	})
	
	// spawning
	if (!target) target = person.pos.findClosestByPath(FIND_STRUCTURES, { filter: (t) =>
		   (t.structureType == STRUCTURE_EXTENSION || t.structureType == STRUCTURE_SPAWN)
		&& t.energy < t.energyCapacity
		&& !_.includes(Memory.targetOf[t.id], this.type)
	})
	
	// labs
	if (!target) target = person.pos.findClosestByPath(FIND_STRUCTURES, { filter: (t) =>
		   t.structureType == STRUCTURE_LAB
		&& t.energy < t.energyCapacity
		&& !_.includes(Memory.targetOf[t.id], this.type)
	})
	
	// finish towers
	if (!target) target = person.pos.findClosestByPath(FIND_STRUCTURES, { filter: (t) =>
		   (t.structureType == STRUCTURE_TOWER)
		&& t.energy < t.energyCapacity - Math.min(50, 0.5*person.carry.energy)
		//&& !_.includes(Memory.targetOf[t.id], this.type)
	})
	
	return target || ERR_NOT_FOUND
}
module.exports.isValidTargetToEnergize = function(target){
	if (!target || typeof target != "object") return false
	if (target.energy == target.energyCapacity) return false
	return true
}
module.exports.tasks.energize = {
	type:				"energize",
	weight:				10,
	say:				"⚡",
	useHomeRoom:		false,
	canInterruptThis:	true,
	canInterruptOthers:	module.exports.canInterruptOthersToEnergize,
	canStart:			module.exports.canStartEnergize,
	canContinue:		module.exports.canContinueEnergize,
	doTask:				module.exports.doEnergize,
	getTarget:			module.exports.getTargetToEnergize,
	isValidTarget:		module.exports.isValidTargetToEnergize,
}

// Pickup
module.exports.canInterruptOthersToPickup = function(person){
	return (person.ticksToLive % 5 == 0 && this.canStart(person))
}
module.exports.canStartPickup = function(person) {
	return this.canContinue(person)
}
module.exports.canContinuePickup = function(person) {
	if (person.room.name != person.memory.homeRoomName && person.room.memory.numHostiles > 0) return false
	if (_.sum(person.carry) >= person.carryCapacity) return false
	return (person.room.find(FIND_DROPPED_RESOURCES).length > 0)

}
module.exports.doPickup = function(person) {
		return module.exports.doTaskGeneric(person, this.type, this.type)
		/*
	let target = Game.getObjectById(person.memory.targetID)
	if (!this.isValidTarget(target)) {
		target = this.getTarget(person)
		person.setTarget(target && target.id)
	}
	
	if (!this.isValidTarget(target)) {
		person.setTarget(null)
		return ERR_NOT_FOUND
	}
	
	let result = person.pickup(target)
	if (person.pos.isBorder() || result == ERR_NOT_IN_RANGE) {
		person.moveTo(target)
	} else {
		person.setTarget(null)
	}
	return result
	*/
}
module.exports.getTargetToPickup = function(person) {
	let target = person.pos.findClosestByPath(FIND_DROPPED_RESOURCES, {filter: (t) => t.resourceType != RESOURCE_ENERGY})
	if (target) return target
	
	return person.pos.findClosestByPath(FIND_DROPPED_RESOURCES)
}
module.exports.tasks.pickup = {
	type:				"pickup",
	weight:				10,
	say:				"⛢",
	useHomeRoom:		false,
	canInterruptThis:	false,
	canInterruptOthers:	module.exports.canInterruptOthersToPickup,
	canStart:			module.exports.canStartPickup,
	canContinue:		module.exports.canContinuePickup,
	doTask:				module.exports.doPickup,
	getTarget:			module.exports.getTargetToPickup,
	isValidTarget:		module.exports.isValidTargetGeneric,
}

// StoreAdd
module.exports.canInterruptOthersToStoreAdd = function(person){
	return (_.includes(["guardPost"], person.getTask()) && this.canStart(person))
}
module.exports.canStartStoreAdd = function(person) {
	if (person.getTask() == "storeGet") return false // don't immediately storeGet a withdrawl
	if (person.getJob() == "feed" && !person.canStartTask("energize")){
		let link = Game.getObjectById(person.room.memory.linkDestinationID)
		if ((!link || link.energy == 0) && _.sum(person.carry) == person.carry[RESOURCE_ENERGY]) {
			return false
		}
	}
	return this.canContinue(person)
}
module.exports.canContinueStoreAdd = function(person) {
	if (_.sum(person.carry) <= 0) return false
	
	return this.isValidTarget(this.getTarget(person))
}
module.exports.doStoreAdd = function(person) {
	let target = Game.getObjectById(person.memory.targetID)
	if (!this.isValidTarget(target)) {
		target = this.getTarget(person)
		person.setTarget(target && target.id)
	}
	
	if (!this.isValidTarget(target)) {
		person.setTarget(null)
		return ERR_NOT_FOUND
	}
	
	let result
	for(let resource in person.carry){
		if (resource == RESOURCE_ENERGY && target.energy){
			result = person.transfer(target, resource, Math.min(person.carry[resource], target.energyCapacity - target.energy ))
			if (result == OK) break
		} else {
			result = person.transfer(target, resource, Math.min(person.carry[resource], target.storeCapacity - _.sum(target.store)))
			if (result == OK) break
		}
	}
	if (person.pos.isBorder() || result == ERR_NOT_IN_RANGE) {
		person.moveTo(target)
	} else {
		person.setTarget(null)
	}
	return result

}
module.exports.getTargetToStoreAdd = function(person) {
	let possibleTargets = []
	let target
	
	if (_.includes(["mine"], person.getJob())){
		target = person.pos.findInRange(FIND_STRUCTURES, 3, { filter: (t) => 
				   t.structureType == STRUCTURE_CONTAINER
				&& _.sum(t.store) < t.storeCapacity
			})[0]
			
		if (target) person.memory.targetID = target.id
		return target
	}
	
	// search this room
	possibleTargets = possibleTargets.concat(person.room.find(FIND_STRUCTURES, { filter: (t) => 
			   t.structureType == STRUCTURE_STORAGE
			&& t.store
			&& _.sum(t.store) < t.storeCapacity
		}))
	if (person.carry[RESOURCE_ENERGY] > 0){
		possibleTargets = possibleTargets.concat(person.room.find(FIND_STRUCTURES, { filter: (t) => 
				   t.structureType == STRUCTURE_LINK
				&& t.energy < t.energyCapacity
				&& t.id != person.room.memory.linkDestinationID
			}))
	}
	if (possibleTargets.length == 0) {		
		possibleTargets = possibleTargets.concat(person.room.find(FIND_STRUCTURES, { filter: (t) => 
				   t.structureType == STRUCTURE_CONTAINER
				&& _.sum(t.store) < t.storeCapacity
			}))
	}
	//console.log("TRACE getTargetToStoreAdd: possibleTargets = "+possibleTargets)
	if (possibleTargets.length > 0) {
		target = person.pos.findClosestByPath(possibleTargets)
		if (target){
			person.memory.targetID = target.id
			return target
		}
	}
	
	// search home room
	let homeRoom = Game.rooms[person.memory.homeRoomName]
	possibleTargets = possibleTargets.concat(homeRoom.find(FIND_STRUCTURES, { filter: (t) => 
			   t.structureType == STRUCTURE_STORAGE
			&& t.store
			&& _.sum(t.store) < t.storeCapacity
		}))
	possibleTargets = possibleTargets.concat(homeRoom.find(FIND_STRUCTURES, { filter: (t) => 
			   t.structureType == STRUCTURE_LINK
			&& t.energy < t.energyCapacity
			&& t.id != homeRoom.memory.linkDestinationID
		}))
	if (possibleTargets.length > 0) {		
		possibleTargets = possibleTargets.concat(homeRoom.find(FIND_STRUCTURES, { filter: (t) => 
				   t.structureType == STRUCTURE_CONTAINER
				&& t.store
				&& _.sum(t.store) < t.storeCapacity
			}))
	}
	
	
	target = person.pos.findClosestByPath(possibleTargets)
	if (target){
		person.memory.targetID = target.id
	}
	return target
}
module.exports.tasks.storeAdd = {
	type:				"storeAdd", 
	weight:				10, 
	say:				"▼", 
	canInterruptThis:	false,
	canInterruptOthers:	module.exports.canInterruptOthersToStoreAdd,
	canStart:			module.exports.canStartStoreAdd, 
	canContinue:		module.exports.canContinueStoreAdd, 
	doTask:				module.exports.doStoreAdd, 
	getTarget:			module.exports.getTargetToStoreAdd, 
	isValidTarget:		module.exports.isValidTargetGeneric
}

// StoreGet
module.exports.canInterruptOthersToStoreGet = function(person){
	return false
}
module.exports.canStartStoreGet = function(person) {
	//console.log(person.room.isGrowing +" "+ person.canStartTask("repairCritical") + " " + person.canStartTask("build"))
	if (person.room.memory.isGrowing){
		if (person.canStartTask("repairCritical") || person.canStartTask("build")) return this.canContinue(person)
			
		if (person.getJob() != "feed" && person.getJob() != "haul" && person.room.getJobCount("feed") > 0) return false
	}
	//if (person.getTask() == "storeGet") return false // don't immediately storeGet after storing
	return this.canContinue(person)
}
module.exports.canContinueStoreGet = function(person) {
	if (_.sum(person.carry) >= person.carryCapacity) return false	
	return this.isValidTarget(this.getTarget(person))
}
module.exports.doStoreGet = function(person) {
	let target = Game.getObjectById(person.memory.targetID)
	if (!this.isValidTarget(target)) {
		target = this.getTarget(person)
		person.setTarget(target && target.id)
	}
	
	if (!this.isValidTarget(target)) {
		person.setTarget(null)
		return ERR_NOT_FOUND
	}
	
	let result = person.withdraw(target, RESOURCE_ENERGY)
	if (person.pos.isBorder() || result == ERR_NOT_IN_RANGE) {
		person.moveTo(target)
	} else {
		person.setTarget(null)
	}
	return result
}
module.exports.getTargetToStoreGet = function(person) {	
	let target = null
	possibleTargets = person.room.find(FIND_STRUCTURES, { filter: (t) => 
		   t.structureType == STRUCTURE_LINK
		&& t.energy > 0
		&& t.id == person.room.memory.linkDestinationID
		})
	if (possibleTargets.length > 0) return person.pos.findClosestByPath(possibleTargets)
		
	possibleTargets = person.room.find(FIND_STRUCTURES, { filter: (t) => 
		   (t.structureType == STRUCTURE_CONTAINER || t.structureType == STRUCTURE_STORAGE)
		&& t.store[RESOURCE_ENERGY] > 0
		})
		
	return person.pos.findClosestByPath(possibleTargets)
}
module.exports.tasks.storeGet = {
	type:				"storeGet",
	weight:				10,
	say:				"△",
	useHomeRoom:		false,
	canInterruptOthers:	module.exports.canInterruptOthersToStoreGet,
	canStart:			module.exports.canStartStoreGet,
	canContinue: 		module.exports.canContinueStoreGet,
	doTask:				module.exports.doStoreGet,
	getTarget:			module.exports.getTargetToStoreGet,
	isValidTarget:		module.exports.isValidTargetGeneric,
}

// GetHaul
module.exports.canInterruptOthersToGetHaul = function(person){
	return false
}
module.exports.canStartGetHaul = function(person) {
	return this.canContinue(person)
}
module.exports.canContinueGetHaul = function(person) {
	if (_.sum(person.carry) >= person.carryCapacity) return false	
	return this.isValidTarget(this.getTarget(person))
}
module.exports.doGetHaul = function(person) {
	let target = Game.getObjectById(person.memory.targetID)
	if (!this.isValidTarget(target)) {
		target = this.getTarget(person)
		person.setTarget(target && target.id)
	}
	
	if (!this.isValidTarget(target)) {
		person.setTarget(null)
		return ERR_NOT_FOUND
	}
	
	let result = ERR_NOT_FOUND
	for (let resourceType in target.store){
		result = person.withdraw(target, resourceType)
		if (result == OK) break
	}
	if (person.pos.isBorder() || person.pos.getRangeTo(target) > 1) {
		person.moveTo(target)
	}else{
		let result = ERR_NOT_FOUND
		for (let resourceType in target.store){
			result = person.withdraw(target, resourceType)
			if (result == OK) break
		}
		person.setTarget(null)
	}
	return result
}
module.exports.getTargetToGetHaul = function(person) {
	let homeRoom = Game.rooms[person.memory.homeRoomName]
	let target = null
	let possibleTargets = []
	possibleTargets = person.room.find(FIND_STRUCTURES, { filter: (t) => 
		   t.structureType == STRUCTURE_LINK
		&& t.energy > 0
		&& t.id == person.room.memory.linkDestinationID
		})
	if (possibleTargets.length > 0) return person.pos.findClosestByPath(possibleTargets)
		
	let availableStorage = homeRoom.find(FIND_STRUCTURES, { filter: (t) => 
		   t.structureType == STRUCTURE_STORAGE
		&& _.sum(t.store) < t.storeCapacity
		})
	
	if (!availableStorage[0]) return false
	
	// high-volume transfer
	for (let roomName in Game.rooms){
		room = Game.rooms[roomName]
		if (!room) continue
		
		possibleTargets = possibleTargets.concat(room.find(FIND_STRUCTURES, { filter: (t) => 
			   t.structureType == STRUCTURE_CONTAINER
			&& _.sum(t.store) >= person.carryCapacity - _.sum(person.carry)
			}))
	}
	
	if (possibleTargets.length == 0){
		// low-volume transfer
		for (let roomName in Game.rooms){
			room = Game.rooms[roomName]
			if (!room) continue
			
			possibleTargets = possibleTargets.concat(room.find(FIND_STRUCTURES, { filter: (t) => 
				   t.structureType == STRUCTURE_CONTAINER
				&& _.sum(t.store) > 0
				}))
		}
	}
	
	target = person.pos.findClosestByPath(possibleTargets)
	if (!target) target = possibleTargets[0]
	return target
}
module.exports.isValidTargetToGetHaul = function(target){
	return module.exports.isValidTargetGeneric(target) && _.sum(target.store) > 0
}
module.exports.tasks.getHaul = {
	type:				"getHaul",
	weight:				10,
	say:				"△...",
	useHomeRoom:		false,
	canInterruptOthers:	module.exports.canInterruptOthersToGetHaul,
	canStart:			module.exports.canStartGetHaul,
	canContinue: 		module.exports.canContinueGetHaul,
	doTask:				module.exports.doGetHaul,
	getTarget:			module.exports.getTargetToGetHaul,
	isValidTarget:		module.exports.isValidTargetToGetHaul,
}






// =================================================================
// == MOVE =========================================================
// =================================================================

// GoHome
module.exports.canInterruptOthersToGoHome = function(person){
	return false
}
module.exports.canStartGoHome = function(person) {
	return this.canContinue(person)
}
module.exports.canContinueGoHome = function(person) {
	return (person.memory.homeRoomName != person.room.name)
}
module.exports.doGoHome = function(person) {
	let homeRoom = Game.rooms[person.memory.homeRoomName]
	let target = homeRoom.find(FIND_STRUCTURES, {filter: (t) =>
		  t.structureType == STRUCTURE_SPAWN
	})[0]
	
	person.moveTo(target)
	
	return OK

}
module.exports.getTargetToGoHome = function(person) {

}
module.exports.tasks.goHome = {
	type:				"goHome",
	weight:				10,
	say:				"🏠",
	useHomeRoom:		true,
	canInterruptOthers:	module.exports.canInterruptOthersToGoHome,
	canStart:			module.exports.canStartGoHome,
	canContinue:		module.exports.canContinueGoHome,
	doTask:				module.exports.doGoHome,
	getTarget:			module.exports.getTargetToGoHome,
	isValidTarget:		module.exports.isValidTargetGeneric,
}

// Idle
module.exports.canInterruptOthersToIdle = function(person){
	return false
}
module.exports.canStartIdle = function(person) {
	return true
}
module.exports.canContinueIdle = function(person) {
	return false
}
module.exports.doIdle = function(person) {
	let homeRoom = Game.rooms[person.memory.homeRoomName]
	let target
	if (homeRoom == person.room) {
		target = person.pos.findClosestByPath(FIND_STRUCTURES, {filter: (t) =>
			  t.structureType == STRUCTURE_SPAWN
		})
	} else {
		target = homeRoom.find(FIND_STRUCTURES, {filter: (t) =>
			  t.structureType == STRUCTURE_SPAWN
		})[0]
	}
	
	//console.log("TRACE: "+homeRoom+" idle target = "+target)
	
	if (!this.isValidTarget(target)) {
		person.setTarget(null)
		return ERR_NOT_FOUND
	}

	let range = person.pos.getRangeTo(target)
	//console.log("TRACE: Range to "+target.name+" : "+person.pos.getRangeTo(target))
	if(person.pos.isBorder() || range == Infinity || range > 3) {
		person.moveTo(target)
	}
	
	return OK

}
module.exports.getTargetToIdle = function(person) {

}
module.exports.tasks.idle = {
	type:				"idle",
	weight:				10,
	say:				"?",
	useHomeRoom:		false,
	canInterruptThis:	true,
	canInterruptOthers:	module.exports.canInterruptOthersToIdle,
	canStart:			module.exports.canStartIdle,
	canContinue:		module.exports.canContinueIdle,
	doTask:				module.exports.doIdle,
	getTarget:			module.exports.getTargetToIdle,
	isValidTarget:		module.exports.isValidTargetGeneric,
}

// Wait
module.exports.canInterruptOthersToWait = function(person){
	return false
}
module.exports.canStartWait = function(person) {
	return true
}
module.exports.canContinueWait = function(person) {
	return false
}
module.exports.doWait = function(person) {
	return OK
}
module.exports.getTargetToWait = function(person) {

}
module.exports.tasks.wait = {
	type:				"wait",
	weight:				10,
	say:				false,
	useHomeRoom:		false,
	canInterruptThis:	true,
	canInterruptOthers:	module.exports.canInterruptOthersToWait,
	canStart:			module.exports.canStartWait,
	canContinue:		module.exports.canContinueWait,
	doTask:				module.exports.doWait,
	getTarget:			module.exports.getTargetToWait,
	isValidTarget:		module.exports.isValidTargetGeneric,
}

// Recycle
module.exports.canInterruptOthersToRecycle = function(person){
	return false
}
module.exports.canStartRecycle = function(person) {
	return this.canContinue(person)

}
module.exports.canContinueRecycle = function(person) {
	return true

}
module.exports.doRecycle = function(person) {
	let homeRoom = Game.rooms[person.memory.homeRoomName]
	let target = homeRoom.find(FIND_STRUCTURES, {filter: (t) =>
		  t.structureType == STRUCTURE_SPAWN
	})[0]
	
	if (!this.isValidTarget(target)) {
		person.setTarget(null)
		return ERR_NOT_FOUND
	}

	person.moveTo(target)
	
	return OK

}
module.exports.getTargetToRecycle = function(person) {

}
module.exports.tasks.recycle = {
	type:				"recycle",
	weight:				10,
	say:				"☠",
	useHomeRoom:		true,
	canInterruptOthers:	module.exports.canInterruptOthersToRecycle,
	canStart:			module.exports.canStartRecycle,
	canContinue:		module.exports.canContinueRecycle,
	doTask:				module.exports.doRecycle,
	getTarget:			module.exports.getTargetToRecycle,
	isValidTarget:		module.exports.isValidTargetGeneric,
}

// Reserve
module.exports.canInterruptOthersToReserve = function(person){
	return true
}
module.exports.canStartReserve = function(person) {
	return true
}
module.exports.canContinueReserve = function(person) {
	if (person.room.memory.numHostiles > 0) {
		log.debug("%s stops %s in %s (under attack)", person.name, this.type, person.room)
		return false
	}
	return true
}
module.exports.doReserve = function(person) {
		//log.debug("%s doReserve", person.name)
		return module.exports.doTaskGeneric(person, this.type, "reserveController")
		/*
	let target = Game.getObjectById(person.memory.targetID)
	if (!this.isValidTarget(target)) {
		target = this.getTarget(person)
		person.setTarget(target && target.id)
	}
	
	if (!this.isValidTarget(target)) {
		person.setTarget(null)
		return ERR_NOT_FOUND
	}

	let result = person.reserveController(target)
	if (person.pos.isBorder() || result == ERR_NOT_IN_RANGE) {
		person.moveTo(target)
	} else {
		person.setTarget(null)
	}
	return result
	*/
}
module.exports.getTargetToReserve = function(person) {
	let target = null
	for (let roomName in Memory.rooms){
		let room = Game.rooms[roomName]
		if (room && room.memory.reserve && this.isValidTarget(room.controller) ){
			let targetOf = Memory.targetOf[room.controller.id]
			if (!targetOf || !_.includes(targetOf, this.type)){
				target = room.controller
				//console.log("TRACE getTargetToReserve: found unattended "+target+" for "+this.type+" in "+room.name)
				if (person) person.setTarget(target && target.id)
				return target || ERR_NOT_FOUND
				break
			}
		}
	}
	
	// check for elderly claimers
	for (let roomName in Memory.rooms){
		let room = Game.rooms[roomName]
		if (room && room.memory.reserve && this.isValidTarget(room.controller) ){
			let numClaimers = 0
			let numElderly = 0
			let elderly = null
			for (let personName in Game.creeps){
				let person = Game.creeps[personName]
				if (person && person.memory.targetID == room.controller.id){
					numClaimers += 1
					if (person.ticksToLive < Memory.retirementAge + 2*person.body.length){
						numElderly += 1
						elderly = person
					}
				}
			}
			if (numClaimers == 1 && numElderly == 1){
				target = room.controller
				//console.log("TRACE getTargetToReserve: found elderly claimer "+elderly.name+" at "+target+" in "+room.name+" (ticksToLive="+elderly.ticksToLive+" retirement="+(Memory.retirementAge+2*elderly.body.length)+")")
				if (person) person.setTarget(target && target.id)
				return target || ERR_NOT_FOUND
				break
			}
		}
	}
	
	if (person) person.setTarget(target && target.id)
	return target || ERR_NOT_FOUND
}
module.exports.isValidTargetToReserve = function(target){
	if (!module.exports.isValidTargetGeneric(target)) return false
	log.trace("isValidTargetToReserve target=%s generic=%s level=%s reservation=%s",
		target,
		module.exports.isValidTargetGeneric(target),
		target.level,
		target.reservation
	)
	return (target.level != undefined) && (!target.reservation || target.reservation.username == "Thal")
}
module.exports.tasks.reserve = {
	type:				"reserve",
	weight:				10,
	say:				false,
	useHomeRoom:		true,
	canInterruptOthers:	module.exports.canInterruptOthersToReserve,
	canStart:			module.exports.canStartReserve,
	canContinue:		module.exports.canContinueReserve,
	doTask:				module.exports.doReserve,
	getTarget:			module.exports.getTargetToReserve,
	isValidTarget:		module.exports.isValidTargetToReserve,
}

// Scout
module.exports.canInterruptOthersToScout = function(person){
	return true
}
module.exports.canStartScout = function(person) {
	return true
}
module.exports.canContinueScout = function(person) {
	return true
}
module.exports.doScout = function(person) {
	let roomName = person.memory.targetRoom
	
	if (roomName == undefined) return 
	
	let flag = Game.flags["Scout"+roomName]
	//console.log("TRACE: scouts["+roomName+"] flag="+flag+" pos="+flag.pos)
	
	if (flag == undefined) {
		// flag removed
		return
	}
	target = new RoomPosition(flag.pos.x, flag.pos.y, roomName)
	
	//console.log("TRACE: "+person.name+".pos.getRangeTo("+target+")="+person.pos.getRangeTo(target))

	if (person.pos.getRangeTo(target) > 1) {
		person.moveTo(target)
	}
	
	return OK

}
module.exports.getTargetToScout = function(person) {

}
module.exports.tasks.scout = {
	type:				"scout",
	weight:				10,
	say:				false,
	useHomeRoom:		true,
	canInterruptOthers:	module.exports.canInterruptOthersToScout,
	canStart:			module.exports.canStartScout,
	canContinue:		module.exports.canContinueScout,
	doTask:				module.exports.doScout,
	getTarget:			module.exports.getTargetToScout,
	isValidTarget:		module.exports.isValidTargetGeneric,
}


 //*/ end