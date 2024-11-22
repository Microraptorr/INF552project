const ctx = {
    w: 1200,
    h: 1400,
    carte_w: 600,
    carte_h: 800,
    timeline_w: 600,
    timeline_h: 300,
    details_w: 600,
    details_h: 700,
};


function transformData(data) {
    let temperatureSeries = { dates: [], series: [] };
    ctx.cityRefTemps = {};
    let cityDeltaTemps = {};
    CITY_NAMES.forEach(
        function (c) {
            ctx.cityRefTemps[c] = [];
            cityDeltaTemps[c] = [];
        }
    );
    data.filter((d) => (d.time.startsWith(ctx.REFERENCE_YEAR))).forEach(
        function (date_record) {
            CITY_NAMES.forEach(
                function (c) {
                    ctx.cityRefTemps[c].push(parseFloat(date_record[c]));
                }
            );
        }
    );
    data.forEach(
        function (date_record) {
            temperatureSeries.dates.push(date_record.time);
            CITY_NAMES.forEach(
                function (city) {
                    let delta = parseFloat(date_record[city]) - getReferenceTemp(city, getMonth(date_record.time));
                    cityDeltaTemps[city].push(delta);
                }
            );
        }
    );
    CITY_NAMES.forEach(
        function (c) {
            temperatureSeries.series.push({ name: c, values: cityDeltaTemps[c] });
        }
    );
    return temperatureSeries;
};

function createViz() {
    console.log("Using D3 v" + d3.version);
    let mainG = d3.select("#main");
    mainG.append("div").attr("id", "map");
    mainG.append("div").attr("id", "timelineG")
                    .attr("transform", `translate(${ctx.carte_w}, 0)`);
    mainG.append("svg").attr("id", "detailsG")
                    .attr("transform", `translate(${ctx.carte_w}, ${ctx.timeline_h})`);
    loadData();
};

function loadData() {
    Promise.all([
        d3.csv("TDF_data/stages_general.csv"),
        d3.csv("TDF_data/cities_with_coordinates.csv")
    ]).then(function (data) {
        generateMap(data);
    }).catch(function (error) { console.log(error) });
};

// Function to check if a feature is within the user-defined bounds
function isWithinBounds(feature,limits) {
    const featureBounds = calculateBoundingBox(feature.geometry);
    feature.bbox = featureBounds;  // Add the bounding box to the feature properties
    const [minX, minY] = featureBounds[0];
    const [maxX, maxY] = featureBounds[1];
    // console.log(feature.properties.na,minY,maxY,minX,maxX)
    
    return (
      minX <= limits[1][1] && maxX >= limits[1][0] &&
      minY <= limits[0][1] && maxY >= limits[0][0]
    );
};

// Function to calculate the bounding box as d3.geoBounds() need to be used with clockwise coordinates, which isn't the case
function calculateBoundingBox(geometry) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    // Function to update the bounding box based on coordinates
    function updateBounds(coords) {
        coords.forEach(function(coord) {
            let x = coord[0];
            let y = coord[1];

            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
        });
    }

    // Check geometry type and process coordinates accordingly
    if (geometry.type === "Polygon") {
        geometry.coordinates.forEach(function(ring) {
            updateBounds(ring);
        });
    } else if (geometry.type === "MultiPolygon") {
        geometry.coordinates.forEach(function(polygon) {
            polygon.forEach(function(ring) {
                updateBounds(ring);
            });
        });
    }

    return [[minX, minY], [maxX, maxY]]; // Bounding box in [SW, NE] format
}

function circleClick(e){
    let clickedCircle=e.target
    console.log(clickedCircle)
    clickedCircle.bindPopup(clickedCircle.options.city).openPopup();
}

function generateMap(data){
    var map = L.map('map').setView([47.0874657, 2.6485882], 6);
    L.tileLayer('https://tile.opentopomap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map)
    var marker = L.marker([51.5, -0.09]).addTo(map);//juste pour savoir ajouter un marqueur

    // label data
    const stages_general = data[0];
    city_coordinates=data[1];

    //add circles for cities' number of occurrences in the race
    city_coordinates.forEach((d)=>{
        let occurrences = stages_general.filter((stage)=>(stage.Origin==d.City)||stage.Destination==d.City).length;
        
        var circle = L.circleMarker([d.lat,d.lon],{
            city: d.City,
            color: 'red',
            fillColor: '#f03',
            fillOpacity: 0.5,
            radius: 3*(Math.log(occurrences)+1)
        }).addTo(map).on('click',circleClick);
    })

    console.log(city_coordinates);

}