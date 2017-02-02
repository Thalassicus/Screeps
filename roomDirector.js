let _ = require("lodash")
var jobDirector = require("jobDirector")

retirementAge = 60

module.exports = {

};

Room.prototype.createPerson = function(jobName, info){
	let spawner = this.find(FIND_MY_SPAWNS)[0]
	let	personName = spawner.createCreep(this.getBodyParts(jobName))
	switch (personName){
		case ERR_NOT_ENOUGH_ENERGY:
			break
			
		case ERR_INVALID_ARGS:
			console.log("ERROR createPerson: Invalid body parts for "+jobName+" job:"+this.getBodyParts(jobName))
			break
			
		default:
			console.log("DEBUG createPerson: "+personName+" with "+jobName+" job.")
			break
	}
	
	if (personName < 0) return false
	
	let person = Game.creeps[personName]
				
	this.memory.people.push(personName)
	person.memory.homeRoomName = person.room.name
	
	if (jobName == "scout"){
		let roomName = info
		Memory.scouts[roomName] = personName
		person.memory.targetRoom = roomName
	}
	if (_.includes(["normal","grow"], jobName)){
		person.setJob(jobName, false)
	}else{
		person.setJob(jobName, true)
	}
	
	person.setTask()
	return personName
}

Room.prototype.doSpawns = function(){
	let spawner = this.find(FIND_MY_SPAWNS)[0]
	
	// count workers
	this.memory.people = this.memory.people || []
	let numPeople = this.countNumPeople()
	
	if (spawner == undefined) return
	if (this.memory.isGrowing == undefined) this.memory.isGrowing = true
	
	//console.log("TRACE: "+numPeople+"/"+this.memory.maxPeople+" people in "+this.name)
	
	//this.memory.isGrowing = true
	this.checkIsGrowing()
	
	let personName = ""
	
	let recyclePeople = spawner.pos.findInRange(FIND_MY_CREEPS, 1, {filter: (t) => t.getTask() == "recycle"})
	
	for (i=0; i<recyclePeople.length; i++){
		spawner.recycleCreep(recyclePeople[i])
	}
	
	if (spawner.spawning) return false
	
	let numDoingJob = {}
	for (let jobName in Memory.defaultJobPriorities){
		numDoingJob[jobName] = 0
	}
	for (i=0; i<this.memory.people.length; i++){
		let person = Game.creeps[this.memory.people[i]]
		if (person && person.ticksToLive > 2*retirementAge) {
			numDoingJob[person.getJobType()] += 1
		}
	}
	
	if (this.energyAvailable > 500 && !this.memory.isGrowing){
		// Assign haulers
		if (numDoingJob["haul"] < this.getJobMax("haul")){
			if (this.createPerson("haul")) return true
		}
		
		// Assign guards
		if (numDoingJob["attackMelee"] < this.getJobMax("attackMelee")){
			if (this.createPerson("attackMelee")) return true
		}
		if (numDoingJob["attackRanged"] < this.getJobMax("attackRanged")){
			if (this.createPerson("attackRanged")) return true
		}
		if (numDoingJob["heal"] < this.getJobMax("heal")){
			if (this.createPerson("heal")) return true
		}
	}
	
	// Assign scouts
	for (let roomName in Memory.scouts) {
		//console.log("TRACE: Memory.scouts["+roomName+"]="+Memory.scouts[roomName])
		
		if (Memory.scouts[roomName] == "none"){
			if (this.createPerson("scout", roomName)) return true
		}
	}
	
	// Assign temp jobs
	if (numPeople >= this.memory.maxPeople) {
		let [oldestWorker, oldestWorkerCost] = this.getOldestWorkerCost()
		if (oldestWorkerCost < this.energyAvailable){
			console.log("DEBUG getOldestWorkerCost: "+oldestWorker+" costs "+oldestWorkerCost+"/"+this.energyAvailable+".")
		}
		return
	}
	
	if (this.createPerson(this.memory.isGrowing && "grow" || "normal")) {
		console.log("INFO: "+numPeople+"/"+this.memory.maxPeople+" people in "+this)
		return true
	}
	
	return false
}

Room.prototype.getOldestWorkerCost = function(){
	let oldestWorker = null
	let oldestAge = 0
	for (i=0; i<this.memory.people.length; i++){
		let person = Game.creeps[this.memory.people[i]]
		if (person && person.ticksToLive > oldestAge && _.includes(["normal","grow"], person.getJobType())) {
			oldestAge = person.ticksToLive
			oldestWorker = person
		}
	}
	
	let cost = 0
	let body = []
	for (i=0; i<oldestWorker.body.length; i++){
		let partType = oldestWorker.body[i].type
		cost += BODYPART_COST[partType]
		body.push(partType)
	}
	return [oldestWorker.name, cost]
}

Room.prototype.getBodyParts = function(job){
	let numPeople = this.countNumPeople()
	let scale = 1
	let maxPersonCost = Math.min(this.energyCapacityAvailable, 3000) * (scale * (numPeople+1) / this.memory.maxPeople)
	maxPersonCost = Math.max(200, Math.min(maxPersonCost, this.energyCapacityAvailable))
	let personParts = []
	let personCost = 0
	let count = 0
	switch (job) {			
		case "scout":
			personParts.push(MOVE)
			break
			
		case "grow":
		case "normal":
			count = Math.floor(Math.min(50/3, maxPersonCost / 200))
			personCost = count * 200
			if (maxPersonCost == 300){
				// spawner with 0 extensions
				personParts.push(CARRY)
				personParts.push(MOVE)
			} else if (maxPersonCost == 350){
				// spawner with 1 extension
				personParts.push(WORK)
				personParts.push(MOVE)
			}
			for (i=0; i<count; i++){
				personParts.push(WORK)
				personParts.push(CARRY)
				personParts.push(MOVE)
			}
			break
			
		case "haul":
			count = Math.floor(Math.min((50-2)/2, (maxPersonCost-150) / 100))
			for (i=0; i<count; i++){
				personParts.push(CARRY)
				personParts.push(MOVE)
			}
			personCost = count * 100 + 150
			personParts.push(WORK)
			personParts.push(MOVE)
			break
			
		case "attackMelee":
			count = Math.floor(Math.min((50-3)/4, (maxPersonCost-200) / 190))
			
			for (i=0; i<count; i++){
				personParts.push(TOUGH)
			}
			for (i=0; i<count; i++){
				personParts.push(ATTACK)
				personParts.push(MOVE)
				personParts.push(MOVE)
			}
			personCost = count * 190 + 200
			personParts.push(WORK)
			personParts.push(CARRY)
			personParts.push(MOVE)
			break
			
		case "attackRanged":
			count = Math.floor(Math.min((50-3)/2, (maxPersonCost-200) / 200))
			
			for (i=0; i<count; i++){
				personParts.push(MOVE)
			}
			for (i=0; i<count; i++){
				personParts.push(RANGED_ATTACK)
			}
			personCost = count * 200 + 200
			personParts.push(WORK)
			personParts.push(CARRY)
			personParts.push(MOVE)
			//console.log("DEBUG getBodyParts: energy="+this.energyCapacityAvailable+" numPeople="+numPeople+" targetPeople="+this.memory.maxPeople+" maxPersonCost="+maxPersonCost+" personCost="+personCost)
			//console.log("DEBUG                   personParts="+personParts)
			break
			
		case "heal":
			count = Math.floor(Math.min((50-3)/2, (maxPersonCost-200) / 300))
			
			for (i=0; i<count; i++){
				personParts.push(MOVE)
			}
			for (i=0; i<count; i++){
				personParts.push(HEAL)
			}
			personCost = count * 300 + 200
			personParts.push(WORK)
			personParts.push(CARRY)
			personParts.push(MOVE)
			//console.log("DEBUG getBodyParts: energy="+this.energyCapacityAvailable+" numPeople="+numPeople+" targetPeople="+this.memory.maxPeople+" maxPersonCost="+maxPersonCost+" personCost="+personCost)
			//console.log("DEBUG                   personParts="+personParts)
			break
			
		default:
			break
	}
	return personParts
}

Room.prototype.doTasks = function(){	
    for (i=0; i<this.memory.people.length; i++ ) {
        let person = Game.creeps[this.memory.people[i]]
		if (!person) continue
		
		if (!person.memory.task){
			person.setJob()
			person.setTask()
		}
		
		
		if (person.ticksToLive < retirementAge && person.getJobType() != "recycle"){
			person.setJob("recycle", true)
			continue
		}
		
		if (!person.canContinueTask()) {
			/*
			TODO: 				
			Figure out why people going off the map to complete a task
			causes a room to forget people from taskCount.
			*/
			let task = person.setTask()
			//if (task == ERR_NOT_FOUND) person.suicide() // critically injured
		}
		let result = person.doTask()
		if (result == OK) {
			// pick new task and move
		}
    }
}

Room.prototype.doLinks = function(){
	let storage = this.find(FIND_MY_STRUCTURES, {filter: {structureType: STRUCTURE_STORAGE}})[0]
	let links = this.find(FIND_MY_STRUCTURES, {filter: {structureType: STRUCTURE_LINK}})
	if (!storage || links.length == 0) return false
	
	let bestDistance = 999
	let linkDestination = null
	for (i=0; i<links.length; i++){
		let link = links[i]
		let distance = link.pos.getRangeTo(storage)
		//console.log("DEBUG: distance from "+link+" to "+storage+" is "+distance+".")
		if (distance < bestDistance){
			bestDistance = distance
			linkDestination = link
			this.memory.linkDestinationID = link.id
		}
	}
	//console.log("DEBUG: link destination: "+linkDestination+".")
	for (i=0; i<links.length; i++ ){
		let link = links[i]
		if (link != linkDestination && link.energy > 0){
			//console.log("DEBUG: transfer "+link.energy+" energy from "+link+" to "+linkDestination+".")
			link.transferEnergy(linkDestination, link.energy)
		}
	}
}

Room.prototype.towerAttack = function() {
	let hostiles = this.find(FIND_HOSTILE_CREEPS)
    
	let username = hostiles[0].owner.username
	//Game.notify(`User ${username} spotted in room ${this.name}`)
	let towers = this.find(FIND_MY_STRUCTURES, {filter: {structureType: STRUCTURE_TOWER}})
	towers.forEach(tower => tower.attack(hostiles[0]))
}

Room.prototype.countNumPeople = function(){
	let numPeople = 0
	for (i=0; i<this.memory.people.length; i++){
		let person = Game.creeps[this.memory.people[i]]
		if (person && (person.getJobType() != "scout")) {
			numPeople++
		}
	}
	return numPeople
}

Room.prototype.findRepairTower = function(){
	if (!this.controller.my) return false
	
	let roomName = this.name
	let energySource = this.find(FIND_MY_STRUCTURES, {filter: {structureType: STRUCTURE_STORAGE}})[0]
	if (!energySource) energySource = this.find(FIND_MY_STRUCTURES, {filter: {structureType: STRUCTURE_SPAWN}})[0]
	let towers = this.find(FIND_MY_STRUCTURES, {filter: {structureType: STRUCTURE_TOWER}})
	
	let closestTower = towers[0]
	let closestDistance = 9999
	
	if (towers.length == 0) {
		return false
	} else if (towers.length == 1) {
		this.memory.repairTowerID = closestTower.id
		return true
	}
	
	for (i=0; i<towers.length; i++){
		let distance = energySource.pos.getRangeTo(towers[i].pos)
		//console.log("DEBUG: "+towers[i]+" is "+distance+" from "+energySource)
		if (distance < closestDistance) {
			closestTower = towers[i]
			closestDistance = distance
		}
	}
	this.memory.repairTowerID = closestTower.id
	//console.log("DEBUG: Closest tower: "+closestTower)
}

Room.prototype.repairWithTowers = function() {
	if (this.memory.isGrowing == true) return
	
	let tower = Game.structures[this.memory.repairTowerID]
	if (!tower) {
		this.findRepairTower()
		tower = Game.structures[this.memory.repairTowerID]
		if (!tower) return false
	}
		
	if (tower.energy < 0.25 * tower.energyCapacity) return
	
	// Critically damaged structures
	let repairTargets = this.find(FIND_STRUCTURES, {filter: (t) =>
					   t.hits < 0.5 * t.hitsMax
					&& t.structureType != STRUCTURE_WALL
					&& t.structureType != STRUCTURE_RAMPART
				})
	if (repairTargets[0]) {
		tower.repair(repairTargets[0])
		return
	}
	
	// Damaged structures
	if (tower.energy < 0.5 * tower.energyCapacity) return // save for defense
	repairTargets = this.find(FIND_STRUCTURES, {filter: (t) =>
					   t.hits < t.hitsMax
					&& t.structureType != STRUCTURE_WALL
					&& t.structureType != STRUCTURE_RAMPART
				})
	if (repairTargets[0]) {
		tower.repair(repairTargets[0])
		return
	}
	
	// Walls and ramparts
	repairTargets = this.find(FIND_STRUCTURES, {filter: (t) =>
		   t.hits < this.getWallMax()
		&& (t.structureType == STRUCTURE_WALL || t.structureType == STRUCTURE_RAMPART)
	})
	if (repairTargets[0]) {
		tower.repair(repairTargets[0])
		return
	}
}

Room.prototype.countHarvestSpots = function(){
	let sources = this.find(FIND_SOURCES)
	let harvestSpots = 0
	for (i=0; i<sources.length; i++){
		let source = sources[i]
		if (Memory.sources[source.id] == undefined){
			Memory.sources[source.id] = {}
			let sourceSpots = 0
			for (x=source.pos.x-1; x<=source.pos.x+1; x++){
				for (y=source.pos.y-1; y<=source.pos.y+1; y++){
					if (Game.map.getTerrainAt(x, y, this.name) != "wall") {
						sourceSpots += 1
					}
				}
			}
			Memory.sources[source.id].numHarvesters = 0
			Memory.sources[source.id].maxHarvesters = sourceSpots
			Memory.sources[source.id].room = this
			console.log("INFO: Discovered new source in "+this+" with "+sourceSpots+" harvest directions.")
		}
		harvestSpots += Memory.sources[source.id].maxHarvesters
	}
	//console.log("DEBUG: "+this+" has "+harvestSpots+" harvest spots.")
	return harvestSpots
}

Room.prototype.checkIsGrowing = function(){	
	let numPeople = this.countNumPeople()
	if (numPeople < 0.5 * this.memory.maxPeople){
		if (!this.memory.isGrowing) {
			this.memory.isGrowing = true
			console.log("INFO:  Grow room "+this.name+" ("+numPeople+"/"+this.memory.maxPeople+")")
			this.setJobLimits()
			this.setTaskLimits()
			this.resetPeople()
		}
	} else if (this.memory.isGrowing && numPeople > 2 + 0.5 * this.memory.maxPeople) {
		this.memory.isGrowing = false
		console.log("INFO:  Stop growing room "+this.name+" ("+numPeople+"/"+this.memory.maxPeople+")")
		this.setJobLimits()
		this.setTaskLimits()
		this.resetPeople()
	}
}

Room.prototype.getWallMax = function() {
	if (!this.memory.wallMax) this.setWallMax()
	return this.memory.wallMax
}
	
Room.prototype.setWallMax = function(max) {
	let maxByLevel = 500 * Math.pow(3, this.controller.level - 1)
	if (!max) max = maxByLevel
	this.memory.wallMax = Math.max(maxByLevel, max)
	//console.log("DEBUG:  "+this.name+" wallMax="+this.memory.wallMax+", maxByLevel="+maxByLevel)
}

// end