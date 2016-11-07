'use strict';

var path = require('path');
var Sequelize = require('sequelize');
var config_ = require(path.join(__dirname, 'config.json'))
var config = config_['db'][config_.selected];
var sequelize = new Sequelize(config.database, config.username, config.password, config);
var db = {};

db['path'] = sequelize.define('path', {
	start: { type: Sequelize.STRING, primaryKey: true, charset: 'utf8', collate: 'utf8_bin' },
	path: Sequelize.TEXT,
	rank: Sequelize.INTEGER,
});

db.sequelize = sequelize;
db.Sequelize = Sequelize;

module.exports = db;