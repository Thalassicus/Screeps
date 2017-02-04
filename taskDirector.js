let _ = require("lodash")
let task = require("prototype.task")
let tools = require("tools")

module.exports = {}

Memory.targetOf = Memory.targetOf || {}

RoomPosition.prototype.isBorder = function(){
	if (Game.map.getTerrainAt(this) == "wall") return false
	return (this.x == 0 || this.x == 49 || this.y == 0 || this.y == 49)
}

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
	for (let taskInfo of this.memory.priorities){
		if (this.canInterruptForTask(taskInfo.key)){
			if (taskInfo.key != "salvage"){
				console.log(sprintf("DEBUG doTask: %10s interrupts %s for %s in %s.", this.name, this.getTask(), taskInfo.key, this.room))
			}
			this.setTask(taskInfo.key)
			return module.exports.tasks[taskInfo.key].doTask(this)
		}
	}

	return module.exports.tasks[task].doTask(this)
	//this.taskFunction[task](this)
	
}

Creep.prototype.getTask = function(){
	if (!this.memory.task){
		console.log("WARN getTask: "+this.name+" task is "+this.memory.task+".")
		//this.setTask()
	}
	return this.memory.task
}

Creep.prototype.setTask = function(forceTask) {
	if (this.memory.task == undefined){
		this.memory.task = "idle"
		this.room.changeTaskCount("idle", 1)
	}
	if (this.memory.priorities == undefined) {
		this.setJob("normal")
		return
	}
	
	let oldTask = this.memory.task
	if (oldTask && this.memory.priorities.length <= 1) {
		return oldTask
	}
	
	let task = forceTask
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
	
	if (!_.includes(["guardPost","idle","scout"], task)) {
		//console.log("TRACE: " + this.room.getTaskCount(task) + "/" + this.room.getTaskMax(task) + " people doing " + task + " (current task: " + this.getTask() + ")")
	}
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
		}
	}
	if (targetID){
		module.exports.setTarget(personName, null)
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
		console.log("ERROR taskDirector: module.exports["+task+"] is undefined!")
		return false
	}
	return module.exports.tasks[task].canContinue(this)
}

Creep.prototype.canInterruptForTask = function(task){
	if (this.getTask() == task) return false
	if (!module.exports.tasks[this.getTask()].canInterruptThis) return false
	if (this.room.getTaskCount(task) >= this.room.getTaskMax(task)) return false
	
	if (module.exports.tasks[task] == undefined) {
		console.log("ERROR: module.exports["+task+"] is undefined!")
		return false
	}
	if (module.exports.tasks[task].canInterruptOthers == undefined){
		console.log("ERROR: canInterruptOthers is undefined for task "+task+"!")
		return false
	}
	return module.exports.tasks[task].canInterruptOthers(this)
}

Creep.prototype.canStartTask = function(task){
	if (this.room.getTaskCount(task) >= this.room.getTaskMax(task)) {
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

// In task functions, "this" is the task object, such as module.exports.tasks.attack

module.exports.tasks = {}

module.exports.doGenericTask = function(person, target, functionCall){
	if (typeof target != "object") return ERR_NOT_FOUND
	
	let result = functionCall(target)
	if (person.pos.isBorder() || result == ERR_NOT_IN_RANGE) {
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
	type:				"attack",
	weight:				10,
	say:				"⚔",
	useHomeRoom:		false,
	canInterruptOthers:	module.exports.canInterruptOthersToAttack,
	canStart:			module.exports.canStartAttack,
	canContinue:		module.exports.canContinueAttack,
	doTask:				module.exports.doAttack,
	getTarget:			module.exports.getTargetToAttack,
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
	type:				"attackRanged",
	weight:				10,
	say:				"⚔",
	useHomeRoom:		false,
	canInterruptOthers:	module.exports.canInterruptOthersToAttackRanged,
	canStart:			module.exports.canStartAttackRanged,
	canContinue:		module.exports.canContinueAttackRanged,
	doTask:				module.exports.doAttackRanged,
	getTarget:			module.exports.getTargetToAttackRanged,
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
	type:				"heal",
	weight:				10,
	say:				"⚔",
	useHomeRoom:		false,
	canInterruptOthers:	module.exports.canInterruptOthersToHeal,
	canStart:			module.exports.canStartHeal,
	canContinue:		module.exports.canContinueHeal,
	doTask:				module.exports.doHeal,
	getTarget:			module.exports.getTargetToHeal,
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
	let target = Game.flags.Guard1
	
	if (typeof target != "object") {
		console.log("TRACE doGuardPost: Could not find Guard1 flag.")
		return ERR_NOT_FOUND
	}
	//Memory.targetOf[target.id] = person.getTask()

	let range = person.pos.getRangeTo(target)
	if(person.pos.isBorder() || range == Infinity || range > 1) {
		person.moveTo(target)
	}
	
	return OK
}
module.exports.getTargetToGuardPost = function(person) {

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
	let target = this.getTarget(person)
	
	if (typeof target != "object") return ERR_NOT_FOUND
	//Memory.targetOf[target.id] = person.getTask()
	
	let result = person.build(target)
	if (person.pos.isBorder() || result == ERR_NOT_IN_RANGE) {
		person.moveTo(target)
	}
	return OK
}
module.exports.getTargetToBuild = function(person) {
	return person.pos.findClosestByPath(FIND_CONSTRUCTION_SITES)
}
module.exports.tasks.build = {
	type:				"build",
	weight:				10,
	say:				"🔨",
	useHomeRoom:		false,
	canInterruptThis:	true,
	canInterruptOthers:	module.exports.canInterruptOthersToBuild,
	canStart:			module.exports.canStartBuild,
	canContinue:		module.exports.canContinueBuild,
	doTask:				module.exports.doBuild,
	getTarget:			module.exports.getTargetToBuild,
}

// Harvest
module.exports.canInterruptOthersToHarvest = function(person){
	return false
}
module.exports.canStartHarvest = function(person) {
	if (person.room.getJobCount("haul") == 0
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
				&& t.store
				&& t.store[RESOURCE_ENERGY] > 0.25 * t.storeCapacity
				}).length > 0){
			//console.log("TRACE: do not harvest (build from storage)")
			return false
		}
	}
	return this.canContinue(person)

}
module.exports.canContinueHarvest = function(person) {
	if (_.sum(person.carry) >= person.carryCapacity) return false
	if (person.room.name != person.memory.homeRoomName && person.ticksToLive < 90) {
		//console.log("TRACE: "+person.name+" stop harvest in "+person.room+" (retire to home)")
		return false
	}
	
	return person.pos.findClosestByPath(FIND_SOURCES_ACTIVE)
	//return person.room.find(FIND_SOURCES_ACTIVE).length > 0

}
module.exports.doHarvest = function(person) {
	let target = person.pos.findClosestByPath(FIND_SOURCES_ACTIVE)
	
	if (typeof target != "object") return ERR_NOT_FOUND
	//Memory.targetOf[target.id] = person.getTask()
		
	let result = person.harvest(target)
	if (person.pos.isBorder() || result == ERR_NOT_IN_RANGE) {
		person.moveTo(target)
	}
	return result

}
module.exports.getTargetToHarvest = function(person) {

}
module.exports.tasks.harvest = {
	type:				"harvest",
	weight:				10,
	say:				"⛏",
	useHomeRoom:		false,
	canInterruptThis:	false,
	canInterruptOthers:	module.exports.canInterruptOthersToHarvest,
	canStart:			module.exports.canStartHarvest,
	canContinue:		module.exports.canContinueHarvest,
	doTask:				module.exports.doHarvest,
	getTarget:			module.exports.getTargetToHarvest,
}

// HarvestFar
module.exports.canInterruptOthersToHarvestFar = function(person){
	return false
}
module.exports.canStartHarvestFar = function(person) {
	// Should we energize from storage?
	if (person.room.getJobCount("haul") == 0
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
	let targetID = person.memory.targetID
	if (targetID && Game.getObjectById(targetID) && Game.getObjectById(targetID).energy && Game.getObjectById(targetID).energy <= 0) {
		//console.log("TRACE: "+person.name+" stop harvestFar in "+person.room+" (source is empty)")
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
		
	if (person.pos.isBorder() || result == ERR_NOT_IN_RANGE) {
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
	return (person.room.find(FIND_STRUCTURES, {filter: (t) =>
		   t.hits < t.hitsMax - Math.min(50, 0.5*person.carry.energy)
		&& t.structureType != STRUCTURE_WALL
		&& t.structureType != STRUCTURE_RAMPART
	}).length > 0)
}
module.exports.doRepair = function(person) {
	let target = this.getTarget(person)
	
	if (!target || typeof target != "object") {
		console.log("ERROR doRepair: "+person.name+" target is "+target+" in "+person.room)
		return ERR_NOT_FOUND
	}
	//Memory.targetOf[target.id] = person.getTask()
	
	let result = person.repair(target)
	if (person.pos.isBorder() || result == ERR_NOT_IN_RANGE) {
		person.moveTo(target)
	}
	//console.log("TRACE doRepair: "+person.name+" repair "+target+" result "+result)
	return result
}
module.exports.getTargetToRepair = function(person) {
	return person.pos.findClosestByPath(FIND_STRUCTURES, {filter: (t) =>
		   t.hits < t.hitsMax - Math.min(50, 0.5*person.carry.energy)
		&& t.structureType != STRUCTURE_WALL
		&& t.structureType != STRUCTURE_RAMPART
	})
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
}

// RepairCritical
module.exports.canInterruptOthersToRepairCritical = function(person){
	return (person.ticksToLive % 10 == 0 && this.canStart(person))
}
module.exports.canStartRepairCritical = function(person) {
	return this.canContinue(person)
}
module.exports.canContinueRepairCritical = function(person) {
	let homeRoom = Game.rooms[person.memory.homeRoomName]
	return (person.carry.energy > 0) && (person.room.find(FIND_STRUCTURES, {filter: (t) =>
			   t.hits < Math.min(5000, 0.05 * t.hitsMax)
			&& t.structureType != STRUCTURE_WALL
			&& t.structureType != STRUCTURE_RAMPART
		}).length > 0)

}
module.exports.doRepairCritical = function(person) {
	let target = person.pos.findClosestByPath(FIND_STRUCTURES, {filter: (t) =>
		   t.hits < Math.min(5000, 0.05 * t.hitsMax)
		&& t.structureType != STRUCTURE_WALL
	})
	
	if (typeof target != "object") return ERR_NOT_FOUND
	//Memory.targetOf[target.id] = person.getTask()
	
	let result = person.repair(target)
	if (person.pos.isBorder() || result == ERR_NOT_IN_RANGE) {
		person.moveTo(target)
	}
	return result
}
module.exports.getTargetToRepairCritical = function(person) {

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
	let room = Game.rooms[person.memory.homeRoomName]
	let target = room.controller
	
	if (typeof target != "object") return ERR_NOT_FOUND

	let result = person.upgradeController(target)
	if (person.pos.isBorder() || result == ERR_NOT_IN_RANGE) {
		person.moveTo(target)
	}
	return result
}
module.exports.getTargetToUpgrade = function(person) {

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
	return module.exports.doUpgrade(person)
}
module.exports.getTargetToUpgradeFallback = function(person) {

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
}

// Wall
module.exports.canInterruptOthersToWall = function(person){
	return (person.ticksToLive % 10 == 0 && this.canStart(person))
}
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
	
	let result = person.repair(target)
	if (person.pos.isBorder() || result == ERR_NOT_IN_RANGE) {
		person.moveTo(target)
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
	if (person.room.memory.numHostiles == 0 && person.getJob() != "haul" && person.room.getJobCount("haul") > 0) return false
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
	let target = Game.getObjectById(person.memory.targetID)
	if (!this.isValidTarget(target)) {
		target = this.getTarget(person)
	}
	
	if (!this.isValidTarget(target)) {
		if (target != ERR_NOT_FOUND) {
			console.log("ERROR doEnergize: target is "+target)
		}
		return ERR_NOT_FOUND
	}
	
	let result = person.transfer(target, RESOURCE_ENERGY)
	if (person.pos.isBorder() || result == ERR_NOT_IN_RANGE) {
		person.moveTo(target)
	}
	if (result == OK){
		target = this.getTarget(person)
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
	
	// finish towers
	if (!target) target = person.pos.findClosestByPath(FIND_STRUCTURES, { filter: (t) =>
		   (t.structureType == STRUCTURE_TOWER)
		&& t.energy < t.energyCapacity - Math.min(50, 0.5*person.carry.energy)
		//&& !_.includes(Memory.targetOf[t.id], this.type)
	})
	
	module.exports.setTarget(person.name, target && target.id)
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

// Salvage
module.exports.canInterruptOthersToSalvage = function(person){
	return (person.ticksToLive % 5 == 0 && this.canStart(person))
}
module.exports.canStartSalvage = function(person) {
	return this.canContinue(person)
}
module.exports.canContinueSalvage = function(person) {
	if (person.room.name != person.memory.homeRoomName && person.room.memory.numHostiles > 0) return false
	if (_.sum(person.carry) >= person.carryCapacity) return false
	return (person.room.find(FIND_DROPPED_RESOURCES).length > 0)

}
module.exports.doSalvage = function(person) {
	let target = this.getTarget(person)
	
	if (typeof target != "object") return ERR_NOT_FOUND
	
	let result = person.pickup(target)
	if (person.pos.isBorder() || result == ERR_NOT_IN_RANGE) {
		person.moveTo(target)
	}
	return result
}
module.exports.getTargetToSalvage = function(person) {
	let target = person.pos.findClosestByPath(FIND_DROPPED_RESOURCES, {filter: (t) => t.resourceType != RESOURCE_ENERGY})
	if (target) return target
	
	return person.pos.findClosestByPath(FIND_DROPPED_RESOURCES)
}
module.exports.tasks.salvage = {
	type:				"salvage",
	weight:				10,
	say:				"⛢",
	useHomeRoom:		false,
	canInterruptThis:	false,
	canInterruptOthers:	module.exports.canInterruptOthersToSalvage,
	canStart:			module.exports.canStartSalvage,
	canContinue:		module.exports.canContinueSalvage,
	doTask:				module.exports.doSalvage,
	getTarget:			module.exports.getTargetToSalvage,
}

// StoreAdd
module.exports.canInterruptOthersToStoreAdd = function(person){
	return false
}
module.exports.canStartStoreAdd = function(person) {
	if (person.getTask() == "storeGet") return false // don't immediately storeGet a withdrawl
	if (person.getJob() == "haul" && !person.canStartTask("energize")) return false
	return this.canContinue(person)
}
module.exports.canContinueStoreAdd = function(person) {
	let homeRoom = Game.rooms[person.memory.homeRoomName]
	if (_.sum(person.carry) <= 0) return false
	//if (homeRoom.memory.isGrowing && homeRoom.find(FIND_SOURCES_ACTIVE).length == 0) return false
	
	if (person.carry.energy > 0) {
		// save room for minerals
		if (person.room.find(FIND_STRUCTURES, {filter: (t) => 
				   t.structureType == STRUCTURE_STORAGE
				&& t.store[RESOURCE_ENERGY] < 0.9 * t.storeCapacity
				}).length > 0) {
			//console.log("TRACE: canContinueStoreAdd with STORAGE")
			return true
		}
		if (person.room.find(FIND_STRUCTURES, {filter: (t) => 
				   t.structureType == STRUCTURE_CONTAINER
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
	
	if (person.pos.isBorder() || person.pos.getRangeTo(target) > 1) {
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
		return target
	}
}
module.exports.tasks.storeAdd = {
	type:				"storeAdd", 
	weight:				10, 
	say:				"▼", 
	canInterruptOthers:	module.exports.canInterruptOthersToStoreAdd,
	canStart:			module.exports.canStartStoreAdd, 
	canContinue:		module.exports.canContinueStoreAdd, 
	doTask:				module.exports.doStoreAdd, 
	getTarget:			module.exports.getTargetToStoreAdd
}

// StoreGet
module.exports.canInterruptOthersToStoreGet = function(person){
	return false
}
module.exports.canStartStoreGet = function(person) {
	//console.log(person.room.isGrowing +" "+ person.canStartTask("repairCritical") + " " + person.canStartTask("build"))
	if (person.room.memory.isGrowing){
		if (person.canStartTask("repairCritical") || person.canStartTask("build")) return this.canContinue(person)
			
		if (person.getJob() != "haul" && person.room.getJobCount("haul") > 0) return false
	}
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
	
	if (person.pos.isBorder() || person.pos.getRangeTo(target) > 1) {
		person.moveTo(target)
	}
	let result = person.withdraw(target, RESOURCE_ENERGY)
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
			   (t.structureType == STRUCTURE_CONTAINER || t.structureType == STRUCTURE_STORAGE)
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
	type:				"storeGet",
	weight:				10,
	say:				"△",
	useHomeRoom:		false,
	canInterruptOthers:	module.exports.canInterruptOthersToStoreGet,
	canStart:			module.exports.canStartStoreGet,
	canContinue: 	module.exports.canContinueStoreGet,
	doTask:				module.exports.doStoreGet,
	getTarget:			module.exports.getTargetToStoreGet,
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
	
	if (typeof target != "object") return ERR_NOT_FOUND
	//Memory.targetOf[target.id] = person.getTask()

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
	
	if (typeof target != "object") return ERR_NOT_FOUND

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
}

// Reserve
module.exports.canInterruptOthersToReserve = function(person){
	return true
}
module.exports.canStartReserve = function(person) {
	return true
}
module.exports.canContinueReserve = function(person) {
	return true
}
module.exports.doReserve = function(person) {
	let target = Game.getObjectById(person.memory.targetID)
	if (!this.isValidTarget(target)) {
		target = this.getTarget(person)
	}

	let result = person.reserveController(target)
	if (person.pos.isBorder() || result == ERR_NOT_IN_RANGE) {
		person.moveTo(target)
	}
	return result
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
				break
			}
		}
	}
	if (!target){
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
					break
				}
			}
		}
	}
	
	if (person) module.exports.setTarget(person.name, target && target.id)
	return target || ERR_NOT_FOUND
}
module.exports.isValidTargetToReserve = function(target){
	if (!target || typeof target != "object") return false
	if (target.level == undefined) return false
	if (target.reservation && target.reservation.username != "Thal") return false
	return true
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
}


 // end