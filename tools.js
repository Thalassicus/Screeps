/*
 * Module code goes here. Use 'module.exports' to export things:
 * module.exports.thing = 'a thing';
 *
 * You can import it from another modules like this:
 * var mod = require('utilities');
 * mod.thing == 'a thing'; // true
 */
 
 

module.exports = {/**
	 * Returns a random integer between min (inclusive) and max (inclusive)
	 * Using Math.round() will give you a non-uniform distribution!
	 */
	GetRandomInt: function(min, max) {
		return Math.floor(Math.random() * (max - min + 1)) + min;
	},
	GetRandomWeighted: function(list, size) {
		size = size || 100
		let chanceIDs = Game.GetWeightedTable(list, size)

		if (chanceIDs == -1) {
			return -1
		}
		let randomID = this.GetRandomInt(1, size)
		if (chanceIDs[randomID] == undefined) {
			console.log("WARN: Game.GetrandomIDWeighted: invalid random index selected = " + randomID)
			chanceIDs[randomID] = -1
		}
		return chanceIDs[randomID]
	},
	
    GetWeightedTable: function(list, size){
		let totalWeight	= 0
		let chanceIDs	= {}
		let position	= 1
		
		for (var key in list) {
			totalWeight = totalWeight + math.max(0, list[key])
		}
		
		if (totalWeight == 0) {
			for (var key in list) {
				list[key] = 1
				totalWeight = totalWeight + 1
			}
			if (totalWeight == 0) {
				console.log("WARN: GetWeightedTable: empty list")
				return -1
			}
		}
		
		for (var key in list) {
			let weight = list[key]
			let positionNext = position + size * math.max(0, weight) / totalWeight
			for (i = math.floor(position); i < math.floor(positionNext); i++) {
				chanceIDs[i] = key
			}
			position = positionNext
		}	
		return chanceIDs
    },

	findCenterOfRoom: function(roomName){
		let center = new RoomPosition(24, 24, roomName)
		return center
	},
}