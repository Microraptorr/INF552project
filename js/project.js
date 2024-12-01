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



function circleClick(e){
    let clickedCircle=e.target
    console.log(clickedCircle)
    clickedCircle.bindPopup(clickedCircle.options.city).openPopup();
}

function generateMap(data){
    // label data
    ctx.stages_general = data[0];
    ctx.city_coordinates=data[1];
    console.log(ctx.city_coordinates);

    ctx.map = L.map('map').setView([47.0874657, 2.6485882], 6);
    L.DomUtil.addClass(ctx.map._container, 'crosshair-cursor-enabled');
    L.tileLayer('http://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19,
        attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(ctx.map)

    //create an SVG overlay
    L.svg().addTo(ctx.map);
    let mapSvg=d3.select("#map").select("svg")
        .attr("id","mapSvg");

    //draw cities
    ctx.city_selected=null;
    drawCities();


    //update the map when zooming or moving
    ctx.map.on('zoom', function () { updatePoints(); });
    ctx.map.on('moveend', function () {
        updatePoints();
    });

    //if map is clicked, selects the closest city. if clicked again, unselects it
    ctx.map.on('click', function (e) {
        if (ctx.city_selected==null){
            ctx.city_selected=getClosestCity(e.latlng);
            console.log(ctx.city_selected.City);
            drawCities()
        }else{
            ctx.city_selected=null;
            console.log("unselected");
            drawCities();
        }
    });
}

//function to update the points and lines on the map
function updatePoints() {
    circles = d3.select("#cities").selectAll("circle")
        .attr("r", (d)=>(25 / Math.sqrt(3*ctx.map.getZoom())*Math.log(d.occurrences+1)))
        .attr("cx", d => ctx.map.latLngToLayerPoint([d.lat, d.lon]).x)
        .attr("cy", d => ctx.map.latLngToLayerPoint([d.lat, d.lon]).y);

    lines = d3.select("#links").selectAll("line")
    .attr("x1", (d) => {
        const OriginCity = ctx.city_coordinates.find((city) => city.City == d.Origin);
        return ctx.map.latLngToLayerPoint([OriginCity.lat, OriginCity.lon]).x;
    })
    .attr("y1", (d) => {
        const OriginCity = ctx.city_coordinates.find((city) => city.City == d.Origin);
        return ctx.map.latLngToLayerPoint([OriginCity.lat, OriginCity.lon]).y;
    })       
    .attr("x2", (d) => {
        const DestCity = ctx.city_coordinates.find((city) => city.City == d.Destination);
        return ctx.map.latLngToLayerPoint([DestCity.lat, DestCity.lon]).x;
    })        
    .attr("y2", (d) => {
        const DestCity = ctx.city_coordinates.find((city) => city.City == d.Destination);
        return ctx.map.latLngToLayerPoint([DestCity.lat, DestCity.lon]).y;
    }) 
}

function getClosestCity(cursorCoords) {
    let res = ctx.city_coordinates[0];
    let smallestDist = Math.pow(res.lon - cursorCoords.lng, 2) + Math.pow(res.lat - cursorCoords.lat, 2);
    for (let i = 1; i < ctx.city_coordinates.length; i++) {
        let dist = Math.pow(ctx.city_coordinates[i].lon - cursorCoords.lng, 2) + Math.pow(ctx.city_coordinates[i].lat - cursorCoords.lat, 2);
        if (dist < smallestDist) {
            res = ctx.city_coordinates[i];
            smallestDist = dist;
        }
    }
    let newSelection = d3.select(res.City);
    if (ctx.selectedPlane == null) {
        ctx.selectedPlane = newSelection;
    }
    else {
        ctx.selectedPlane.style("filter", "none");
        ctx.selectedPlane.style("outline", "none");
        ctx.selectedPlane = newSelection;
    }
    ctx.selectedPlane.style("filter", "drop-shadow(0px 0px 1px rgb(128,0,128))");
    ctx.selectedPlane.style("outline", "1px solid rgb(128,0,128,.5)");
    return res;
}

//draw points and lines on the map
function drawCities(){

    //cities' number of occurrences in the race
    ctx.city_coordinates.forEach((d)=>{
        d.occurrences = ctx.stages_general.filter((stage)=>(stage.Origin==d.City)||stage.Destination==d.City).length;
    })

    //create a color scale to color the cities based on the number of visits
    occurrences_extent = d3.extent(ctx.city_coordinates,(d)=>(d.occurrences));
    const colorScale = d3.scaleSequential(d3.interpolatePlasma).domain(occurrences_extent);


    //selects unique stages and add a count of the number of each stage
    // Normalize the key by sorting Origin and Destination (i.e. "A->B" and "B->A" are the same)
    const groupedStages = d3.group(
        ctx.stages_general,
        d => {
            const [from, to] = [d.Origin, d.Destination].sort(); // Sort to normalize
            return `${from}->${to}`;
        }
    );

    // Convert the group into an array with counts
    const uniqueStagesWithCounts = Array.from(groupedStages, ([key, values]) => {
        const [Origin, Destination] = key.split("->");
        return {
            Origin,
            Destination,
            count: values.length
        };
    });

    //filters stages that depart from or arrive to the selected city
    let uniqueStagesWithCounts_filtered = uniqueStagesWithCounts
    if(ctx.city_selected) {
        uniqueStagesWithCounts_filtered = uniqueStagesWithCounts.filter((d)=>(d.Origin==ctx.city_selected.City||d.Destination==ctx.city_selected.City))
    }

    //remove previous lines and cities
    d3.select("#links").remove();
    d3.select("#cities").remove();
    
    //draw lines (stages)
    d3.select("#mapSvg").append("g")
        .attr("id","links")
        .selectAll("line")
        .data(uniqueStagesWithCounts_filtered)
        .enter()
        .append("line")
        .attr("stroke","black")
        .attr("stroke-opacity",1)
        .attr("stroke-width",(d)=>d.count)
        .attr("x1", (d) => {
            const OriginCity = ctx.city_coordinates.find((city) => city.City == d.Origin);
            return ctx.map.latLngToLayerPoint([OriginCity.lat, OriginCity.lon]).x;
        })
        .attr("y1", (d) => {
            const OriginCity = ctx.city_coordinates.find((city) => city.City == d.Origin);
            return ctx.map.latLngToLayerPoint([OriginCity.lat, OriginCity.lon]).y;
        })       
        .attr("x2", (d) => {
            const DestCity = ctx.city_coordinates.find((city) => city.City == d.Destination);
            return ctx.map.latLngToLayerPoint([DestCity.lat, DestCity.lon]).x;
        })        
        .attr("y2", (d) => {
            const DestCity = ctx.city_coordinates.find((city) => city.City == d.Destination);
            return ctx.map.latLngToLayerPoint([DestCity.lat, DestCity.lon]).y;
        }) 
    
        //draw cities
        d3.select("#mapSvg").append("g")
        .attr("id","cities")
        .selectAll("circle")
        .data(ctx.city_coordinates)
        .enter()
        .append("circle")
        .attr("id",(d)=>d.City)
        .attr("r", (d)=>(25 / Math.sqrt(3*ctx.map.getZoom())*Math.log(d.occurrences+1)))
        .attr("fill", (d) => colorScale(d.occurrences))
        .attr("fill-opacity", 0.8)
        .attr("cx", (d) => ctx.map.latLngToLayerPoint([d.lat, d.lon]).x)
        .attr("cy", (d) => ctx.map.latLngToLayerPoint([d.lat, d.lon]).y)
        
}