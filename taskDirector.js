let _ = require("lodash")
let task = require("prototype.task")
let tools = require("tools")

module.exports = {}

Memory.targetOf = Memory.targetOf || {}

// =================================================================
// == TASK MANAGEMENT ==============================================
// =================================================================

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
	return module.exports.tasks[task].doTask(this)
	//this.taskFunction[task](this)
	
}

Creep.prototype.getTask = function(){
	return this.memory.task
}

Creep.prototype.setTask = function(task) {
	if (this.memory.priorities == undefined) {
		this.setJob("normal")
		return
	}
	
	let oldTask = this.getTask()
	if (oldTask && this.memory.priorities.length <= 1) {
		return oldTask
	}
	
	if (task == undefined){
		if (oldTask == "harvest" && this.room.memory.numHostiles == 0 && !this.room.memory.isGrowing && this.canStartTask("storeAdd")) {
			task = "storeAdd"
		} else {
			for (let taskInfo of this.memory.priorities){
				if (this.canStartTask(taskInfo.key)){
					task = taskInfo.key
					break
				}
			}
		}
	}
	
	if (!task) {
		console.log("ERROR setTask: No valid task for "+this.name+".")
		return ERR_NOT_FOUND
	}
	
	let sayString = module.exports.tasks[task].say
	if (sayString){
		this.say(sayString, true)
	}
	
	let homeRoom = Game.rooms[this.memory.homeRoomName]
	if (module.exports.tasks[task].useHomeRoom){
		homeRoom.changeTaskCount(task, 1)
	}else{
		this.room.changeTaskCount(task, 1)
	}
	
	//console.log("TRACE: " + this.room.getTaskCount(task) + "/" + this.room.getTaskMax(task) + " people doing " + task + " (current task: " + this.getTask() + ")")
	if (oldTask) {
		//if (oldTask == "storeGet") console.log(Game.time+" "+this.name+" say storeGet")
		if (module.exports.tasks[oldTask].useHomeRoom){
			homeRoom.unassignTask(this.name, oldTask)
		} else {
			this.room.unassignTask(this.name, oldTask)
		}
	}
	
	this.memory.task = task
	
	return task
}

Room.prototype.unassignTask = function(personName, task) {
	this.changeTaskCount(task, -1)
	let targetID = Memory.creeps[personName].targetID
	if (task == "harvestFar"){
		let target = Game.getObjectById(targetID)
		if (typeof target == "object" && Memory.sources[targetID]) {
			Memory.sources[targetID].numHarvesters = Math.max(0, Memory.sources[targetID].numHarvesters - 1)
			Memory.creeps[personName].targetID = null
			//console.log("DEBUG: harvesting stops  at "+target+" in "+target.room+" ("+Memory.sources[targetID].numHarvesters+"/"+Memory.sources[targetID].maxHarvesters+" harvesters) with "+personName+"." )
		}
	}
	if (targetID){
		//Memory.targetOf[targetID] = undefined
		//if (task == "storeAdd") console.log("DEBUG: unassign storeAdd set target")
		module.exports.setTarget(personName, null)
		//if (task != "scout") Memory.creeps[personName].target = null
	}
}

Room.prototype.unassignJob = function(personName, job) {
	this.changeJobCount(job, -1)
}

Creep.prototype.canContinueTask = function(task){
	if (task==undefined) {
		task = this.getTask()
	}
	if (module.exports.tasks[task] == undefined) {
		console.log("ERROR: taskDirector module.exports["+task+"] is undefined!")
		return false
	}
	return module.exports.tasks[task].canContinue(this)
}

Creep.prototype.canStartTask = function(task){
	if (this.room.getTaskCount(task) >= this.room.getTaskMax(task)) {
		//console.log("TRACE: "+task+" at max")
		return false
	}
	if (module.exports.tasks[task] == undefined) {
		console.log("ERROR: module.exports["+task+"] is undefined!")
		return false
	}
	return module.exports.tasks[task].canStart(this)
}

Room.prototype.getTaskCount = function(task) {
	if (!this.memory.taskCount) this.setTaskLimits()
	return this.memory.taskCount[task]
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

// In task functions, "this" is the task object, such as module.exports.tasks.attack

module.exports.tasks = {}

module.exports.doGenericTask = function(person, target, functionCall){
	if (typeof target != "object") return ERR_NOT_FOUND
	//Memory.targetOf[target.id] = person.getTask()
	
	//console.log("DEBUG: functionCall = "+functionCall)
	let result = functionCall(target)
	if (result == ERR_NOT_IN_RANGE) {
		person.moveTo(target)
	}
	return result
}
module.exports.setTarget = function(personName, newTargetID){
	let targetArray = Memory.targetOf[Memory.creeps[personName].targetID]
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
	}
	Memory.creeps[personName].targetID = newTargetID
}
module.exports.isTargetedFor = function(targetID, task){
	return Memory.targetOf[targetID] && _.includes(Memory.targetOf[targetID], task)
}


// =================================================================
// == COMBAT =======================================================
// =================================================================

// Attack
module.exports.canStartAttack = function(person) {
	return this.canContinue(person)
}
module.exports.canContinueAttack = function(person) {
	if (person.getActiveBodyparts(ATTACK) == 0) return false
	for (roomName in Memory.scouts){ // only defend rooms with active scouts
		if (Memory.rooms[roomName].numHostiles > 0){
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
	//Memory.targetOf[target.id] = person.getTask()
	
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
	name:			"attack",
	weight:			10,
	say:			"⚔",
	useHomeRoom:	false,
	canStart:		module.exports.canStartAttack,
	canContinue:	module.exports.canContinueAttack,
	doTask:			module.exports.doAttack,
	getTarget:		module.exports.getTargetToAttack,
}

// Attack Ranged
module.exports.canStartAttackRanged = function(person) {
	return this.canContinue(person)
}
module.exports.canContinueAttackRanged = function(person) {
	if (person.getActiveBodyparts(RANGED_ATTACK) == 0) return false
	for (roomName in Memory.scouts){ // only defend rooms with active scouts
		if (Memory.rooms[roomName].numHostiles > 0){
			return true
		}
	}
	return false
}
module.exports.doAttackRanged = function(person) {
	let target = this.getTarget(person)
	if (typeof target != "object") return ERR_NOT_FOUND
	//Memory.targetOf[target.id] = person.getTask()
	
	let result = person.rangedAttack(target)
	person.moveTo(target)
	
	//console.log("DEBUG: "+person.name+" attacking "+target+" with result "+result+".")
	return result || false
}
module.exports.getTargetToAttackRanged = function(person) {
	return module.exports.getTargetToAttack(person)
}
module.exports.tasks.attackRanged = {
	name:			"attackRanged",
	weight:			10,
	say:			"⚔",
	useHomeRoom:	false,
	canStart:		module.exports.canStartAttackRanged,
	canContinue:	module.exports.canContinueAttackRanged,
	doTask:			module.exports.doAttackRanged,
	getTarget:		module.exports.getTargetToAttackRanged,
}

// Heal
module.exports.canStartHeal = function(person) {
	return this.canContinue(person)
}
module.exports.canContinueHeal = function(person) {
	if (person.getActiveBodyparts(HEAL) == 0) return false
	return this.getTarget(person)
}
module.exports.doHeal = function(person) {
	//return module.exports.doGenericTask(person, this.getTarget(person), person.heal)
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
	name:			"heal",
	weight:			10,
	say:			"⚔",
	useHomeRoom:	false,
	canStart:		module.exports.canStartHeal,
	canContinue:	module.exports.canContinueHeal,
	doTask:			module.exports.doHeal,
	getTarget:		module.exports.getTargetToHeal,
}

// GuardPost
module.exports.canStartGuardPost = function(person) {
	return Game.flags.Guard1
}
module.exports.canContinueGuardPost = function(person) {
	return false
}
module.exports.doGuardPost = function(person) {
	let target = Game.flags.Guard1
	
	if (typeof target != "object") {
		console.log("TRACE doGuardPost: Could not find Guard1 flag.")
		return ERR_NOT_FOUND
	}
	//Memory.targetOf[target.id] = person.getTask()

	let range = person.pos.getRangeTo(target)
	if(range == Infinity || range > 1) {
		person.moveTo(target)
	}
	
	return OK
}
module.exports.getTargetToGuardPost = function(person) {

}
module.exports.tasks.guardPost = {
	name:			"guardPost",
	weight:			10,
	say:			false,
	useHomeRoom:	false,
	canStart:		module.exports.canStartGuardPost,
	canContinue:	module.exports.canContinueGuardPost,
	doTask:			module.exports.doGuardPost,
	getTarget:		module.exports.getTargetToGuardPost,
}


// =================================================================
// == WORK =========================================================
// =================================================================

// Build
module.exports.canStartBuild = function(person) {
	return this.canContinue(person)
}
module.exports.canContinueBuild = function(person) {
	if (person.carry.energy <= 0) return false
	if (person.room.memory.numHostiles > 0) return false
	return (person.room.find(FIND_CONSTRUCTION_SITES).length > 0)
}
module.exports.doBuild = function(person) {
	let target = person.pos.findClosestByPath(FIND_CONSTRUCTION_SITES)
	
	if (typeof target != "object") return ERR_NOT_FOUND
	//Memory.targetOf[target.id] = person.getTask()
	
	if (person.pos.getRangeTo(target) > 3 || person.build(target) == ERR_NOT_IN_RANGE) {
		person.moveTo(target)
	}
	return OK
}
module.exports.getTargetToBuild = function(person) {
	
}
module.exports.tasks.build = {
	name:			"build",
	weight:			10,
	say:			"🔨+",
	useHomeRoom:	false,
	canStart:		module.exports.canStartBuild,
	canContinue:	module.exports.canContinueBuild,
	doTask:			module.exports.doBuild,
	getTarget:		module.exports.getTargetToBuild,
}

// Harvest
module.exports.canStartHarvest = function(person) {
	if (person.room.getJobCount("haul") == 0 && person.canStartTask("storeGet") && person.room.getTaskCount("energize") < person.room.getTaskMax("energize")){
		if (person.room.find(FIND_STRUCTURES, {filter: (t) => 
					(t.structureType == STRUCTURE_EXTENSION || t.structureType == STRUCTURE_SPAWN)
					&& t.energy < t.energyCapacity
				}).length > 0){
			//console.log("TRACE: do not harvest (energize spawns)")
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
	return this.canContinue(person)

}
module.exports.canContinueHarvest = function(person) {
	let homeRoom = Game.rooms[person.memory.homeRoomName]
	if (_.sum(person.carry) >= person.carryCapacity) return false
	
	if (person.pos.findClosestByPath(FIND_SOURCES_ACTIVE)){
	//if (person.room.find(FIND_SOURCES_ACTIVE).length > 0) {
		return true
	} else {
		// Maximum number of harvesters reached
		// homeRoom.changeMaxTasks(task, -1)
		//console.log("TRACE: No sources to harvest for "+person.name+" in "+person.room.name+".")
		return false
	}

}
module.exports.doHarvest = function(person) {
	let target = person.pos.findClosestByPath(FIND_SOURCES_ACTIVE)
	
	if (typeof target != "object") return ERR_NOT_FOUND
	//Memory.targetOf[target.id] = person.getTask()
		
	let result = person.harvest(target)
	if (result == ERR_NOT_IN_RANGE) {
		person.moveTo(target)
	}
	return result

}
module.exports.getTargetToHarvest = function(person) {

}
module.exports.tasks.harvest = {
	name:			"harvest",
	weight:			10,
	say:			"⛏",
	useHomeRoom:	false,
	canStart:		module.exports.canStartHarvest,
	canContinue:	module.exports.canContinueHarvest,
	doTask:			module.exports.doHarvest,
	getTarget:		module.exports.getTargetToHarvest,
}

// HarvestFar
module.exports.canStartHarvestFar = function(person) {
	/*
	if (person.canStartTask("storeGet") && person.room.getTaskCount("energize") < person.room.getTaskMax("energize")){
		if (person.room.find(FIND_STRUCTURES, {filter: (t) => 
					(t.structureType == STRUCTURE_EXTENSION || t.structureType == STRUCTURE_SPAWN)
					&& t.energy < t.energyCapacity
				}).length > 0){
			//console.log("TRACE: do not harvestFar (do stuff at home)")
			return false
		}
		if (person.room.find(FIND_STRUCTURES, {filter: (t) => 
					(t.structureType == STRUCTURE_TOWER)
					&& t.energy < 0.55 * t.energyCapacity
				}).length > 0){
			//console.log("TRACE: do not harvestFar (do stuff at home)")
			return false
		}
	}
	*/
	let openSpots = false
	for (let sourceID in Memory.sources){
		if (!Game.getObjectById(sourceID)) return
		if (Game.getObjectById(sourceID).energy > 0 && (Memory.sources[sourceID].numHarvesters < Memory.sources[sourceID].maxHarvesters)) {
			openSpots = true
			break
		}
	}
	if (!openSpots) {
		console.log("DEBUG: No available sources to "+this.name+" with "+person+".")
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
	if (person.ticksToLive < 180) {
		//console.log("TRACE: "+person.name+" stop harvestFar in "+person.room+" (retire to home)")
		//return false
	}
	let targetID = person.memory.targetID
	if (targetID && Game.getObjectById(targetID) && Game.getObjectById(targetID).energy <= 0) {
		console.log("TRACE: "+person.name+" stop harvestFar in "+person.room+" (source is empty)")
		return false
	}
	
	return true

}
module.exports.doHarvestFar = function(person) {
	//if(module.exports.isTargetToHarvestFar(person.memory.targetID)){
	if ((!person.memory.targetID) || (typeof Game.getObjectById(person.memory.targetID) != "object")) {
		for (let sourceID in Memory.sources){
			if (!Game.getObjectById(sourceID)) return
			if ((Game.getObjectById(sourceID).energy > 0) && (Memory.sources[sourceID].numHarvesters < Memory.sources[sourceID].maxHarvesters)){
				person.memory.targetID = sourceID
				Memory.sources[sourceID].numHarvesters += 1
				//console.log("DEBUG: harvesting in "+Game.getObjectById(sourceID).room+" ("+ Memory.sources[sourceID].numHarvesters+"/"+ Memory.sources[sourceID].maxHarvesters+" harvesters) with "+person.name+"." )
				//console.log("DEBUG: harvesting starts at "+sourceID+" in "+Game.getObjectById(sourceID).room+" ("+ Memory.sources[sourceID].numHarvesters+"/"+ Memory.sources[sourceID].maxHarvesters+" harvesters) with "+person.name+"." )
				break
			}			
		}
	}
	
	let target = Game.getObjectById(person.memory.targetID)
	
	//console.log("TRACE: "+person.name+" in "+person.room+" harvestFar at "+target+" target.room:"+target.room+" range:"+person.pos.getRangeTo(target))
	
	if (typeof target != "object") return ERR_NOT_FOUND
	//Memory.targetOf[target.id] = person.getTask()
	
	let result = person.harvest(target)
		
	if (result == ERR_NOT_IN_RANGE) {
		person.moveTo(target)
	} else if (result != OK){
		//console.log("DEBUG: "+person.name+" cannot continue doHarvestFar (result = "+result+").")
		person.setTask()
	}
	return result

}
module.exports.getTargetToHarvestFar = function(person) {

}
module.exports.isTargetToHarvestFar = function(targetID) {
	if (!targetID) return false
	let target = Game.getObjectById(targetID)
	return (typeof target == "object") && target.energy
}
module.exports.tasks.harvestFar = {
	name:			"harvestFar",
	weight:			10,
	say:			"⛏+",
	useHomeRoom:	true,
	canStart:		module.exports.canStartHarvestFar,
	canContinue:	module.exports.canContinueHarvestFar,
	doTask:			module.exports.doHarvestFar,
	getTarget:		module.exports.getTargetToHarvestFar,
}

// Repair
module.exports.canStartRepair = function(person) {
	if (person.room.find(FIND_MY_STRUCTURES, {filter: {structureType: STRUCTURE_TOWER}}).length > 0){
		if (!person.room.memory.isGrowing) return false // towers available
	}
	return this.canContinue(person)
}
module.exports.canContinueRepair = function(person) {
	let homeRoom = Game.rooms[person.memory.homeRoomName]
	if (person.carry.energy <= 0) return false
	return (person.room.find(FIND_STRUCTURES, {filter: (t) =>
		   t.hits < t.hitsMax - Math.min(50, 0.5*person.carry.energy)
		&& t.structureType != STRUCTURE_WALL
		&& t.structureType != STRUCTURE_RAMPART
	}).length > 0)
}
module.exports.doRepair = function(person) {
	let target = person.pos.findClosestByPath(FIND_STRUCTURES, {filter: (t) =>
		   t.hits < t.hitsMax - 0.5*person.carry.energy
		&& t.structureType != STRUCTURE_WALL
		&& t.structureType != STRUCTURE_RAMPART
	})
	
	if (typeof target != "object") return ERR_NOT_FOUND
	//Memory.targetOf[target.id] = person.getTask()
		
	if (person.pos.getRangeTo(target) > 3 || person.repair(target) == ERR_NOT_IN_RANGE) {
		person.moveTo(target)
	}
	return OK

}
module.exports.getTargetToRepair = function(person) {

}
module.exports.tasks.repair = {
	name:			"repair",
	weight:			10,
	say:			"🔨",
	useHomeRoom:	false,
	canStart:		module.exports.canStartRepair,
	canContinue:	module.exports.canContinueRepair,
	doTask:			module.exports.doRepair,
	getTarget:		module.exports.getTargetToRepair,
}

// RepairCritical
module.exports.canStartRepairCritical = function(person) {
	return this.canContinue(person)

}
module.exports.canContinueRepairCritical = function(person) {
	let homeRoom = Game.rooms[person.memory.homeRoomName]
	return (person.carry.energy > 0) && (person.room.find(FIND_STRUCTURES, {filter: (t) =>
			   t.hits < Math.min(5000, 0.05 * t.hitsMax)
			&& t.structureType != STRUCTURE_WALL
		}).length > 0)

}
module.exports.doRepairCritical = function(person) {
	let target = person.pos.findClosestByPath(FIND_STRUCTURES, {filter: (t) =>
		   t.hits < Math.min(5000, 0.05 * t.hitsMax)
		&& t.structureType != STRUCTURE_WALL
	})
	
	if (typeof target != "object") return ERR_NOT_FOUND
	//Memory.targetOf[target.id] = person.getTask()
		
	if (person.pos.getRangeTo(target) > 3 || person.repair(target) == ERR_NOT_IN_RANGE) {
		person.moveTo(target)
	}
	return OK

}
module.exports.getTargetToRepairCritical = function(person) {

}
module.exports.tasks.repairCritical = {
	name:			"repairCritical",
	weight:			10,
	say:			"🔨!",
	useHomeRoom:	false,
	canStart:		module.exports.canStartRepairCritical,
	canContinue:	module.exports.canContinueRepairCritical,
	doTask:			module.exports.doRepairCritical,
	getTarget:		module.exports.getTargetToRepairCritical,
}

// Upgrade
module.exports.canStartUpgrade = function(person) {
	return this.canContinue(person)

}
module.exports.canContinueUpgrade = function(person) {
	return person.carry.energy > 0 && person.room.controller.my
}
module.exports.doUpgrade = function(person) {
	let room = Game.rooms[person.memory.homeRoomName]
	let target = room.controller
	
	if (typeof target != "object") return ERR_NOT_FOUND
	//Memory.targetOf[target.id] = person.getTask()

	if(person.upgradeController(target) == ERR_NOT_IN_RANGE) {
		person.moveTo(target)
	}
	
	return OK

}
module.exports.getTargetToUpgrade = function(person) {

}
module.exports.tasks.upgrade = {
	name:			"upgrade",
	weight:			10,
	say:			"◐",
	useHomeRoom:	false,
	canStart:		module.exports.canStartUpgrade,
	canContinue:	module.exports.canContinueUpgrade,
	doTask:			module.exports.doUpgrade,
	getTarget:		module.exports.getTargetToUpgrade,
}

// UpgradeFallback
module.exports.canStartUpgradeFallback = function(person) {
	return this.canContinue(person)
}
module.exports.canContinueUpgradeFallback = function(person) {
	return module.exports.canContinueUpgrade(person)
}
module.exports.doUpgradeFallback = function(person) {
	return module.exports.doUpgrade(person)
}
module.exports.getTargetToUpgradeFallback = function(person) {

}
module.exports.tasks.upgradeFallback = {
	name:			"upgradeFallback",
	weight:			10,
	say:			"◐?",
	useHomeRoom:	false,
	canStart:		module.exports.canStartUpgradeFallback,
	canContinue:	module.exports.canContinueUpgradeFallback,
	doTask:			module.exports.doUpgradeFallback,
	getTarget:		module.exports.getTargetToUpgradeFallback,
}

// Wall
module.exports.canStartWall = function(person) {
	if (person.room.find(FIND_MY_STRUCTURES, {filter: {structureType: STRUCTURE_TOWER}}).length > 0){
		if (!person.room.memory.isGrowing) return false // towers available
	}
	return this.canContinue(person)
}
module.exports.canContinueWall = function(person) {
	if (person.carry.energy <= 0) return false
	if (person.room.memory.numHostiles > 0) return false
	return person.room.find(FIND_STRUCTURES, {filter: (t) =>
		   t.hits < person.room.getWallMax()
		&& (t.structureType == STRUCTURE_WALL || t.structureType == STRUCTURE_RAMPART)
	}).length > 0
}
module.exports.doWall = function(person) {
	let room = Game.rooms[person.memory.homeRoomName]
	let target = person.pos.findClosestByPath(FIND_STRUCTURES, {filter: (t) =>
		   t.hits < room.getWallMax()
		&& (t.structureType == STRUCTURE_WALL || t.structureType == STRUCTURE_RAMPART)
	})
	
	if (typeof target != "object") return ERR_NOT_FOUND
	//Memory.targetOf[target.id] = person.getTask()
		
	if (person.pos.getRangeTo(target) > 3) {
		person.moveTo(target)
	}
	if (person.repair(target) == ERR_NOT_IN_RANGE) {
		person.moveTo(target)
	}
	return OK

}
module.exports.getTargetToWall = function(person) {

}
module.exports.tasks.wall = {
	name:			"wall",
	weight:			10,
	say:			"♜",
	useHomeRoom:	false,
	canStart:		module.exports.canStartWall,
	canContinue:	module.exports.canContinueWall,
	doTask:			module.exports.doWall,
	getTarget:		module.exports.getTargetToWall,
}

// =================================================================
// == MOVE / CARRY =================================================
// =================================================================

// Energize
module.exports.canStartEnergize = function(person) {
	if (person.room.memory.numHostiles == 0 && person.getJobType() != "haul" && person.room.getJobCount("haul") > 0) return false
	return this.canContinue(person)
}
module.exports.canContinueEnergize = function(person) {
	if (person.carry.energy <= 0) return false
	if (person.room.find(FIND_STRUCTURES, {filter: (t) => 
			   (t.structureType == STRUCTURE_EXTENSION || t.structureType == STRUCTURE_SPAWN)
			&& t.energy < t.energyCapacity
			}).length > 0){
		return true
	}
	if (person.room.find(FIND_STRUCTURES, {filter: (t) => 
			   (t.structureType == STRUCTURE_TOWER)
			&& t.energy < t.energyCapacity - Math.min(50, 0.5*person.carry.energy)
			}).length > 0){
		return true
	}
	return false

}
module.exports.doEnergize = function(person) {
	let target //= Game.getObjectById(person.memory.targetID)
	target = this.getTarget(person)
	
	if (typeof target != "object") return ERR_NOT_FOUND
	
	//person.transfer(target, RESOURCE_ENERGY)
	let result = person.transfer(target, RESOURCE_ENERGY)
	if (result == OK){
		//target = this.getTarget(person)
	}
	person.moveTo(target)
	return OK

}
module.exports.getTargetToEnergize = function(person) {
	//let room = Game.rooms[person.memory.homeRoomName]
	let target
	
	// very low towers
	target = target || person.pos.findClosestByPath(FIND_STRUCTURES, { filter: (t) =>
		   (t.structureType == STRUCTURE_TOWER)
		&& t.energy < 0.25 * t.energyCapacity
		//&& !Memory.targetOf[t.id]
	})
	
	// low towers
	target = target || person.pos.findClosestByPath(FIND_STRUCTURES, { filter: (t) =>
		   (t.structureType == STRUCTURE_TOWER)
		&& t.energy < 0.6 * t.energyCapacity
		//&& person.carry.energy > t.energyCapacity - t.energy
		//&& !Memory.targetOf[t.id]
	})
	
	// spawning
	target = target || person.pos.findClosestByPath(FIND_STRUCTURES, { filter: (t) =>
		   (t.structureType == STRUCTURE_EXTENSION || t.structureType == STRUCTURE_SPAWN)
		&& t.energy < t.energyCapacity
		//&& !Memory.targetOf[t.id]
	})
	
	// finish towers
	target = target || person.pos.findClosestByPath(FIND_STRUCTURES, { filter: (t) =>
		   (t.structureType == STRUCTURE_TOWER)
		&& t.energy < t.energyCapacity
		//&& !Memory.targetOf[t.id]
	})
	
	//module.exports.setTarget(person.name, target && target.id)
	return target || ERR_NOT_FOUND
}
module.exports.tasks.energize = {
	name:			"energize",
	weight:			10,
	say:			"⚡",
	useHomeRoom:	false,
	canStart:		module.exports.canStartEnergize,
	canContinue:	module.exports.canContinueEnergize,
	doTask:			module.exports.doEnergize,
	getTarget:		module.exports.getTargetToEnergize,
}

// GoHome
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
	name:			"goHome",
	weight:			10,
	say:			"🏠",
	useHomeRoom:	true,
	canStart:		module.exports.canStartGoHome,
	canContinue:	module.exports.canContinueGoHome,
	doTask:			module.exports.doGoHome,
	getTarget:		module.exports.getTargetToGoHome,
}

// Idle
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
	
	if (typeof target != "object") return ERR_NOT_FOUND
	//Memory.targetOf[target.id] = person.getTask()

	let range = person.pos.getRangeTo(target)
	//console.log("TRACE: Range to "+target.name+" : "+person.pos.getRangeTo(target))
	if(range == Infinity || range > 3) {
		person.moveTo(target)
	}
	
	return OK

}
module.exports.getTargetToIdle = function(person) {

}
module.exports.tasks.idle = {
	name:			"idle",
	weight:			10,
	say:			"?",
	useHomeRoom:	false,
	canStart:		module.exports.canStartIdle,
	canContinue:	module.exports.canContinueIdle,
	doTask:			module.exports.doIdle,
	getTarget:		module.exports.getTargetToIdle,
}

// Recycle
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
	
	if (typeof target != "object") return ERR_NOT_FOUND

	person.moveTo(target)
	
	return OK

}
module.exports.getTargetToRecycle = function(person) {

}
module.exports.tasks.recycle = {
	name:			"recycle",
	weight:			10,
	say:			"☠",
	useHomeRoom:	true,
	canStart:		module.exports.canStartRecycle,
	canContinue:	module.exports.canContinueRecycle,
	doTask:			module.exports.doRecycle,
	getTarget:		module.exports.getTargetToRecycle,
}

// Salvage
module.exports.canStartSalvage = function(person) {
	return this.canContinue(person)
}
module.exports.canContinueSalvage = function(person) {
	let homeRoom = Game.rooms[person.memory.homeRoomName]
	if (_.sum(person.carry) >= person.carryCapacity) return false
	return (person.room.find(FIND_DROPPED_RESOURCES).length > 0)

}
module.exports.doSalvage = function(person) {
	let target = person.pos.findClosestByPath(FIND_DROPPED_RESOURCES)
	
	if (typeof target != "object") return ERR_NOT_FOUND
	//Memory.targetOf[target.id] = person.getTask()
	
	if (person.pos.getRangeTo(target) > 1 || person.pickup(target) == ERR_NOT_IN_RANGE) {
		person.moveTo(target)
	}
	return OK

}
module.exports.getTargetToSalvage = function(person) {

}
module.exports.tasks.salvage = {
	name:			"salvage",
	weight:			10,
	say:			"⛢",
	useHomeRoom:	false,
	canStart:		module.exports.canStartSalvage,
	canContinue:	module.exports.canContinueSalvage,
	doTask:			module.exports.doSalvage,
	getTarget:		module.exports.getTargetToSalvage,
}

// Scout
module.exports.canStartScout = function(person) {
	return true

}
module.exports.canContinueScout = function(person) {
	return false
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

	if (person.pos.getRangeTo(target) == 0) {
		
	} else {
		person.moveTo(target)
	}
	
	return OK

}
module.exports.getTargetToScout = function(person) {

}
module.exports.tasks.scout = {
	name:			"scout",
	weight:			10,
	say:			false,
	useHomeRoom:	true,
	canStart:		module.exports.canStartScout,
	canContinue:	module.exports.canContinueScout,
	doTask:			module.exports.doScout,
	getTarget:		module.exports.getTargetToScout,
}

// StoreAdd
module.exports.canStartStoreAdd = function(person) {
	if (person.getTask() == "storeGet") return false // don't immediately storeGet a withdrawl
	return this.canContinue(person)
}
module.exports.canContinueStoreAdd = function(person) {
	let homeRoom = Game.rooms[person.memory.homeRoomName]
	if (_.sum(person.carry) <= 0) return false
	//if (homeRoom.memory.isGrowing && homeRoom.find(FIND_SOURCES_ACTIVE).length == 0) return false
	
	if (person.carry.energy > 0) {
		// save room for minerals
		if (person.room.find(FIND_STRUCTURES, {filter: (t) => 
				   (t.structureType == STRUCTURE_CONTAINER || t.structureType == STRUCTURE_STORAGE)
				&& t.store[RESOURCE_ENERGY] < 0.9 * t.storeCapacity
				}).length > 0) {
			//console.log("TRACE: canContinueStoreAdd with STORAGE ("++"/"++")")
			return true
	}
		if (person.room.find(FIND_STRUCTURES, {filter: (t) => 
				   (t.structureType == STRUCTURE_CONTAINER || t.structureType == STRUCTURE_CONTAINER)
				&& t.store[RESOURCE_ENERGY] < t.storeCapacity
				}).length > 0) {
			//console.log("TRACE: canContinueStoreAdd with CONTAINER")
			return true
	}
} else {
		//console.log("TRACE: canContinueStoreAdd check other resources")
		if (person.room.find(FIND_STRUCTURES, {filter: (t) => 
				   t.structureType == STRUCTURE_STORAGE
				&& _.sum(t.store) < t.storeCapacity
			}).length > 0) {
			//console.log("TRACE: canContinueStoreAdd with CONTAINER or STORAGE")
			return true
	}
}
	if (person.room.find(FIND_STRUCTURES, {filter: (t) => 
			   (t.structureType == STRUCTURE_LINK)
			&& t.energy < t.energyCapacity
			&& person.room.memory.linkDestinationID != t.id
			}).length > 0) {
		//console.log("TRACE: canContinueStoreAdd with LINK")
		//return true
	}
	return false

}
module.exports.doStoreAdd = function(person) {
	let target = this.getTarget(person)
	
	if (typeof target != "object") return ERR_NOT_FOUND
	//Memory.targetOf[target.id] = person.getTask()
	
	if (person.pos.getRangeTo(target) > 1) {
		person.moveTo(target)
	}
	let result
	for(let resource in person.carry ){
		if (resource == RESOURCE_ENERGY && target.energy){
			result = person.transfer(target, resource, Math.min(person.carry[resource], target.energyCapacity - target.energy ))
		} else {
			result = person.transfer(target, resource, Math.min(person.carry[resource], target.storeCapacity - _.sum(target.store)))
		}
		//if (result != OK) console.log(person.name+" "+result)
	}
	return result

}
module.exports.getTargetToStoreAdd = function(person) {
	let possibleTargets = []
	let target
	
	// search this room
	possibleTargets = possibleTargets.concat(person.room.find(FIND_STRUCTURES, { filter: (t) => 
			   t.structureType == STRUCTURE_STORAGE
			&& t.store
			&& _.sum(t.store) < t.storeCapacity
		}))
	possibleTargets = possibleTargets.concat(person.room.find(FIND_STRUCTURES, { filter: (t) => 
			   t.structureType == STRUCTURE_LINK
			&& t.energy < t.energyCapacity
			&& t.id != person.room.memory.linkDestinationID
		}))
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
	
	
	target = person.pos.findClosestByPath(possibleTargets)
	if (target){
		person.memory.targetID = target.id
		return target
	}
}
module.exports.tasks.storeAdd = {
	name:			"storeAdd", 
	weight:			10, 
	say:			"▼", 
	canStart:		module.exports.canStartStoreAdd, 
	canContinue:	module.exports.canContinueStoreAdd, 
	doTask:			module.exports.doStoreAdd, 
	getTarget:		module.exports.getTargetToStoreAdd
}

// StoreGet
module.exports.canStartStoreGet = function(person) {
	//if (person.getTask() == "storeGet") return false // don't immediately storeGet after storing
	return this.canContinue(person)
}
module.exports.canContinueStoreGet = function(person) {
	let homeRoom = Game.rooms[person.memory.homeRoomName]
	if (_.sum(person.carry) >= person.carryCapacity) return false
	if (person.room.find(FIND_STRUCTURES, {filter: (t) =>
			   (t.structureType == STRUCTURE_CONTAINER || t.structureType == STRUCTURE_STORAGE)
			&& t.store
			&& t.store[RESOURCE_ENERGY] > 0
			}).length == 0){
		return false
}
	if (person.room.memory.isGrowing && homeRoom.find(FIND_SOURCES_ACTIVE).length > 0 && person.room.find(FIND_STRUCTURES, {filter: (t) => 
			   (t.structureType == STRUCTURE_EXTENSION || t.structureType == STRUCTURE_SPAWN)
			&& t.energy < t.energyCapacity
			}).length == 0){
		return false
}
	return true
}
module.exports.doStoreGet = function(person) {
	let target = this.getTarget(person)
	
	if (typeof target != "object") return ERR_NOT_FOUND
	//Memory.targetOf[target.id] = person.getTask()
	
	if (person.pos.getRangeTo(target) > 1) {
		person.moveTo(target)
}
	let result = person.withdraw(target, RESOURCE_ENERGY)
	for(let resource in target.store) {
		//result = person.withdraw(target, resource)
		//if (result == OK) break
}
	return result
}
module.exports.getTargetToStoreGet = function(person) {
	let homeRoom = Game.rooms[person.memory.homeRoomName]
	let possibleTargets
	
	if (person.room == homeRoom){
		possibleTargets = homeRoom.find(FIND_STRUCTURES, { filter: (t) => 
			   t.structureType == STRUCTURE_LINK
			&& t.energy > 0
			&& t.id == homeRoom.memory.linkDestinationID
			})
		if (possibleTargets.length > 0) return person.pos.findClosestByPath(possibleTargets)
			
		possibleTargets = homeRoom.find(FIND_STRUCTURES, { filter: (t) => 
			   t.structureType == STRUCTURE_CONTAINER
			&& t.store
			&& _.sum(t.store) > 0
			})
		if (possibleTargets.length > 0) return person.pos.findClosestByPath(possibleTargets)
			
		possibleTargets = homeRoom.find(FIND_STRUCTURES, { filter: (t) => 
			   t.structureType == STRUCTURE_STORAGE
			&& t.store
			&& t.store[RESOURCE_ENERGY] > 0
			})
		if (possibleTargets.length > 0) return person.pos.findClosestByPath(possibleTargets)
		return ERR_NOT_FOUND
}
	
	possibleTargets = homeRoom.find(FIND_STRUCTURES, { filter: (t) => 
		   t.structureType == STRUCTURE_CONTAINER
		&& t.store
		&& t.store[RESOURCE_ENERGY] > 0
		})			
	return person.pos.findClosestByPath(possibleTargets)
}
module.exports.tasks.storeGet = {
	name:			"storeGet",
	weight:			10,
	say:			"△",
	useHomeRoom:	false,
	canStart:		module.exports.canStartStoreGet,
	canContinue: 	module.exports.canContinueStoreGet,
	doTask:			module.exports.doStoreGet,
	getTarget:		module.exports.getTargetToStoreGet,
}


 // end