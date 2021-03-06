'use strict';
var leaflet = require('leaflet');
var uxhr = require('uxhr');
var _ = require('lodash');
var topojson = require('topojson');
var Promise = require('es6-promise').Promise;
var legendTemplate = require('./templates/legend.handlebars');
var infoTemplate = require('./templates/info.handlebars');

var colors = ["#a50026", "#d73027", "#f46d43", "#fdae61", "#fee090", "#e0f3f8", "#abd9e9", "#74add1", "#4575b4", "#313695"];
var worldwideAvg = 0;
var map, geojson, legend, info;

function fetch(url) {
	return new Promise(function(resolve, reject) {
		uxhr(url, {}, {
			error: function(respText) {
				reject(new Error(respText));
			},
			success: function(respText) {
				resolve(respText);
			}
		});
	});
}

function parseJSON(data) {
	return new Promise(function(resolve) {
		resolve(JSON.parse(data));
	});
}

function highlightFeatures(evt) {
	var layer = evt.target;

	layer.setStyle({
		weight: 3,
		color: '#666',
		fillOpacity: 0.7
	});

	if (!leaflet.Browser.ie && !leaflet.Browser.opera) {
		layer.bringToFront();
	}

	info.update(layer.feature.properties);
}

function resetHighlight(evt) {
	geojson.resetStyle(evt.target);
	info.update();
}

function getColor(percentage) {
	return colors[~~((percentage-45)/(100-45) * colors.length)];
}

function style(feature) {
	return {
		fillColor: getColor(feature.properties.percentage),
		weight: 1,
		opacity: 1,
		color: 'white',
		fillOpacity: 0.7
	};
}

function onEachFeature(feature, layer) {
	layer.on({
		mouseover: highlightFeatures,
		mouseout: resetHighlight
	});
}

function parseCountries(results) {
	var data = results[0];
	var iso_countries = results[1];

	return new Promise(function(resolve) {
		var countries = _(data).map(function(country) {
			var iso = _.find(iso_countries, {cca2: country[0]});

			if (!iso) {
				return null;
			}

			return {
				shortName: iso.cca3,
				name: iso.name.common,
				percentage: country[1]
			};
		}).filter(Boolean);

		resolve(countries.value());
	});
}

var sni = fetch('./sni.json').then(parseJSON);
var world = fetch('./countries.geo.json').then(parseJSON);
var countries = fetch('./countries.json').then(parseJSON);
var dataset = Promise.all([sni, countries]).then(parseCountries);

Promise.all([world, dataset]).then(function(results) {
	var world = topojson.feature(results[0], results[0].objects.countries);
	var countries = results[1];

	world.features = _(world.features).map(function(features) {
		var iso = _.find(countries, {shortName: features.properties.iso_a3 || features.properties.ISO_A3});

		if (!iso) {
			return null;
		}

		return _.extend({}, features, {
			id: iso.name,
			properties: {
				percentage: iso.percentage,
				name: iso.name
			}
		});
	}).filter(Boolean).value();

	geojson = leaflet.geoJson(world, {
		style: style,
		onEachFeature: onEachFeature
	}).addTo(map);
});

var map = leaflet.map('map', {
	minZoom: 2,
	maxZoom: 16,
	maxBounds: [
		[-90, -180],
		[90, 180]
	]
}).setView([0, 0], 2);

window.map = map;

leaflet.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/{variant}/MapServer/tile/{z}/{y}/{x}', {
		attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ',
		variant: 'Canvas/World_Light_Gray_Base'
}).addTo(map);

legend = leaflet.control({
	position: 'bottomleft'
});

legend.onAdd = function() {
	var div = leaflet.DomUtil.create('div', 'info legend');
	var grade = 45;

	var rows = _.map(colors, function(color) {
		var row = {
			color: color,
			start: grade,
			end: grade + 5
		};
		grade+=5;
		return row;
	});

	div.innerHTML = legendTemplate({rows: rows});

	return div;
};

legend.addTo(map);

info = leaflet.control({
	position: 'bottomright'
});

info.onAdd = function() {
	this._div = leaflet.DomUtil.create('div', 'info');
	this.update();
	return this._div;
};

info.update = function(props) {
	this._div.innerHTML = infoTemplate({ props: props, worldwide: worldwideAvg });
};

info.addTo(map);

_.mixin({
	mean: function(obj, key) {
		return _.sum(obj, key) / _.size(obj);
	},
	sum: function(obj, key) {
		var arr;
		if (_.isArray(obj) && typeof obj[0] === 'number') {
			arr = obj;
		} else {
			key = key || 'value';
			arr = _.pluck(obj, key);
		}
		var val = 0, i;
		for (i = 0; i < arr.length; i++) {
			val += (arr[i]-0);
		}
		return val;
	}
});

dataset.then(function(countries) {
	worldwideAvg = _.mean(countries, 'percentage').toFixed(2);
	info.update();
});
