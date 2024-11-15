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
        d3.json("TDF_data/gra.geojson"),
        d3.json("TDF_data/nutsrg.geojson"),
        d3.json("TDF_data/cntrg.geojson")
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

function generateMap(data){
    var map = L.map('map').setView([47.0874657, 2.6485882], 6);
    L.tileLayer('https://tile.opentopomap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map)
    var marker = L.marker([51.5, -0.09]).addTo(map);//juste pour savoir ajouter un marqueur

    // label data
    const graticule = data[0];
    const nutsrg = data[1];
    const cntdata = data[2];

    // create a projection
    ctx.proj = d3.geoIdentity()
                .reflectY(true)
                .fitExtent([[-350,-1000],[ctx.carte_w*2.8, ctx.carte_h*2.1]], graticule);

    // create a path generator
    let geoPathGen = d3.geoPath().projection(ctx.proj);

    //  lat (40,58), long (-11, 15)
    // bout de l'Irlande : 2888109.454312 3445957.724224
    // bout du Dannemark : 4348305.438071 3859116.683410
    // Berlin : 4653124.064551 3344562.533679
    //  bout de la Corse : 4250063.419722 1972461.133042
    lat_range=[1972461.133042, 3859116.683410]
    long_range=[2888109.454312, 4653124.064551]
    limits = [lat_range,long_range]

    const coordFiltered = nutsrg.features.filter((d)=>(d.properties.id.slice(0,2)=="FR"))

    console.log(coordFiltered);
    console.log(cntdata.features);


    // draw the regions
    let regionGroup = d3.select("#carteG")
                        .append("g");
    regionGroup.selectAll("path")
                .data(nutsrg.features)
                .enter()
                .append("path")
                .attr("d", geoPathGen)
                .attr("stroke", "#DDD")
                .attr("class", "nutsArea");
    
    let countries = d3.select("#carteG")
                    .append("g");

    countries.selectAll("path")
            .data(coordFiltered)
            .enter()
            .append("path")
            .attr("d",geoPathGen)
            .attr("stroke","#DDD")
            .attr("class","countriesArea");
}