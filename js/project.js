const ctx = {
    w: 1200,
    h: 1400,
    carte_w: 700,
    carte_h: 800,
    timeline_w: 600,
    timeline_h: 600,
    details_w: 600,
    details_h: 700,
};


function createViz() {
    console.log("Using D3 v" + d3.version);
    let mainG = d3.select("#main");
    mainG.append("div").attr("id", "map");
    mainG.append("div").attr("id", "timelineG");
    mainG.append("svg").attr("id", "detailsG");
    loadData();
};

function loadData() {
    Promise.all([
        d3.csv("TDF_data/stages_general.csv"),
        d3.csv("TDF_data/cities_with_coordinates.csv"),
        d3.csv("TDF_data/overall_rankings.csv"),
        d3.csv("TDF_data/teams_of_the_finishers.csv"),
        d3.csv("TDF_data/data_test.csv")
    ]).then(function (data) {
        generateMap(data);
        overviewFinishersGraph(data);
        console.log("ran")
        checkForUpdates();
    }).catch(function (error) { console.log(error) });
};



function circleClick(e){
    let clickedCircle=e.target
    clickedCircle.bindPopup(clickedCircle.options.city).openPopup();
}

function generateMap(data){
    // label data
    ctx.stages_general = data[0];
    ctx.city_coordinates=data[1];

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

}

//function to update the points and lines on the map
function updatePoints() {
    circles = d3.select("#cities").selectAll("circle")
        .attr("r", (d)=>(25 / Math.sqrt(3*ctx.map.getZoom())*Math.log(d.occurrence_nb+1)))
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
        d.occurrences = ctx.stages_general.filter((stage)=>(stage.Origin==d.City)||stage.Destination==d.City).map((stage)=>(+stage.Date.slice(0,4))),
        d.occurrence_nb=d.occurrences.length;
    })

    //create a color scale to color the cities based on the number of visits
    occurrences_extent = d3.extent(ctx.city_coordinates,(d)=>(d.occurrence_nb));
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

    //filters stages that depart from or arrive to the selected city and selects the linked cities
    let uniqueStagesWithCounts_filtered = uniqueStagesWithCounts;
    ctx.linked_cities=ctx.city_coordinates;

    if(ctx.city_selected) {
        uniqueStagesWithCounts_filtered = uniqueStagesWithCounts.filter((d)=>(d.Origin==ctx.city_selected.City||d.Destination==ctx.city_selected.City));
        ctx.linked_cities = ctx.city_coordinates.filter(city => 
            uniqueStagesWithCounts_filtered.some(stage => 
            (stage.Origin === city.City || stage.Destination === city.City) && city.occurrence_nb > 3
            || city.City === ctx.city_selected.City
            )
        );
    }else{
        ctx.linked_cities = ctx.linked_cities.filter((d)=>(d.occurrence_nb>=10));
    }
    console.log(ctx.linked_cities);


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
        .attr("r", (d)=>(25 / Math.sqrt(3*ctx.map.getZoom())*Math.log(d.occurrence_nb+1)))
        .attr("fill", (d) => colorScale(d.occurrence_nb))
        .attr("fill-opacity", 0.8)
        .attr("cx", (d) => ctx.map.latLngToLayerPoint([d.lat, d.lon]).x)
        .attr("cy", (d) => ctx.map.latLngToLayerPoint([d.lat, d.lon]).y)

        overviewCitiesGraph();
        
}

function overviewCitiesGraph() {
    const { lowerVal, upperVal } = getSliderValues();
    const years = d3.range(lowerVal, upperVal + 1);
  
    const cellSize = 8;
    const margin = { top: 50, right: 20, bottom: 50, left: 150 }; // Increased left margin for city labels
  
    // Check if the SVG already exists
    let svg_2 = d3.select("#citiesTimeline");
  
    if (svg_2.empty()) {
      // If it doesn't exist, create it
      svg_2 = d3.select("#timelineG")
        .append("svg")
        .attr("id", "citiesTimeline")
        .attr("width", years.length * cellSize + margin.left + margin.right)
        .attr("height", ctx.linked_cities.length * cellSize + margin.top + margin.bottom);
    }
  
    // Clear previous content
    svg_2.selectAll("*").remove();
  
    // Create a color scale for visited vs. not visited
    const colorScale = d3.scaleOrdinal()
      .domain([0, 1]) // 0: Not visited, 1: Visited
      .range(["#333", "#FF4500"]); // Gray for not visited, orange for visited
  
    // Draw the grid (heatmap cells)
    svg_2.append("g")
      .selectAll("rect")
      .data(ctx.linked_cities.flatMap((city, y) =>
        years.map((year, x) => ({
          city: city.name,
          year,
          visited: city.occurrences.includes(year) ? 1 : 0, // Binary indicator
          x,
          y
        }))
      ))
      .enter()
      .append("rect")
      .attr("x", d => margin.left + d.x * cellSize - 1)
      .attr("y", d => margin.top + d.y * cellSize - 1)
      .attr("width", cellSize + 1)
      .attr("height", cellSize + 1)
      .attr("fill", d => colorScale(d.visited));
  
    // Create x-axis for the years (only every fifth year)
    const xScale = d3.scaleBand()
      .domain(years.filter(year => year % 5 === 0)) // Only include years divisible by 5
      .range([0, years.length * cellSize]);
  
    svg_2.append("g")
      .attr("transform", `translate(${margin.left}, ${margin.top + ctx.linked_cities.length * cellSize})`) // Position the x-axis at the bottom
      .call(d3.axisBottom(xScale).tickFormat(d => d)) // Add the x-axis using the scale
      .selectAll("text")
      .style("font-size", "10px")
      .attr("transform", "rotate(-45)") // Rotate labels for better readability
      .style("fill", "white") // Set text color to white
      .style("text-anchor", "end");
  
    // Sort cities by descending latitude (.lat)
    const sortedCities = ctx.linked_cities.sort((a, b) => b.lat - a.lat); // Sort by descending lat
  
    // Create y-axis for the cities
    const yScale = d3.scaleBand()
      .domain(sortedCities.map(city => city.City)) // Set the city names on the y-axis
      .range([0, sortedCities.length * cellSize]);
  
    svg_2.append("g")
      .attr("transform", `translate(${margin.left - 10}, ${margin.top})`) // Position the y-axis on the left side
      .call(d3.axisLeft(yScale)) // Add the y-axis using the scale
      .selectAll("text")
      .style("font-size", "10px")
      .style("fill", "white") // Set text color to white
      .style("text-anchor", "end"); // Align the text to the end (right side of the axis)
  
    svg_2.selectAll(".tick line, .domain")
      .attr("stroke", "white"); // Set the axis line color to white
  
    // Optional: Draw gridlines for better readability
    svg_2.append("g")
      .selectAll(".x-gridline")
      .data(years.filter(year => year % 5 === 0)) // Only show gridlines for years divisible by 5
      .enter()
      .append("line")
      .attr("x1", d => margin.left + xScale(d))
      .attr("y1", margin.top)
      .attr("x2", d => margin.left + xScale(d))
      .attr("y2", margin.top + sortedCities.length * cellSize)
      .attr("stroke", "#ccc")
      .attr("stroke-width", 0.5)
      .attr("stroke-dasharray", "4");
  }
  
  
  
  
  

function overviewFinishersGraph(data){

    //the following commented code creates a csv file based on selected/completed data from 2 datasets
    //it has been made so that the webpage loads quicker, as the data is already processed and saved in a csv file

    // //label data
    // ctx.overall_rankings=data[2].map((d)=>({
    //     year:parseInt(d.Year),
    //     name: d.Rider,
    //     team : d.Team,
    //     time : parseFloat(d.TotalSeconds),
    //     gap : parseFloat(d.GapSeconds),
    //     distance : parseFloat(d["Distance (km)"]),
    //     resultType : d.ResultType
    // }));

    // //try to match the nationality of the riders and their teams (more accurate) in another datasource
    // ctx.teams_and_nationalities=data[3].map((d)=>({
    //     year : parseInt(d.Year),
    //     rider : d.Rider.slice(0,-6),
    //     nationality : d.Rider.slice(-4,-1),
    //     true_team : d.Team
    // }));

    // console.log(ctx.teams_and_nationalities);

    // //get nationalities and teams from the previous data in the first dataset
    // ctx.overall_rankings.forEach((d)=>{

    //     //nationality doesn't depend on the year
    //     let nation_match=ctx.teams_and_nationalities.find((e)=>(compareStringsInsensitive(e.rider,d.name)));
    //     d.nationality=null;
    //     if(nation_match) d.nationality = nation_match.nationality;

    //     //team depends on the year
    //     let team_match=ctx.teams_and_nationalities.find((e)=>(compareStringsInsensitive(e.rider,d.name)&&e.year==d.year&&e.true_team!=null));
    //     if (team_match) d.team=team_match.true_team;

    // });

    // console.log(ctx.overall_rankings);

    // const csvData = [
    //     ["year", "name", "team","time","gap","distance","resultType","nationality"], // Header row
    //     ...ctx.overall_rankings.map(d => [d.year, d.name, d.team,d.time,d.gap,d.distance,d.resultType,d.nationality]) // Rows from objects
    // ];
    // exportToCSV(csvData, "data_test.csv");




    //comment this line if you want to use the previous code
    ctx.overall_rankings=data[4];

    //for the graph, filter the data where there's time measurement
    ctx.overall_rankings_filtered=ctx.overall_rankings.filter((d)=>d.resultType=="time"&&d.time!=0);

    //create the svg
    let svg=d3.select("#timelineG").append("svg")
        .attr("id","timeline")
        .attr("width",ctx.timeline_w)
        .attr("height",ctx.timeline_h);

    // Calculate average speed and add it to the data
    ctx.overall_rankings_filtered.forEach(d => {
        d.avgSpeed = d.distance / d.time;
    });

    updateGraph();
}

function updateGraph(){

    //filter the data based on the slider values
    const { lowerVal, upperVal } = getSliderValues();
    overall_rankings_filtered_by_year=ctx.overall_rankings_filtered.filter(d => d.year >= lowerVal && d.year <= upperVal);
    
    let svg = d3.select("#timeline");

    // Remove previous points
    svg.selectAll("#points").remove();
    // Remove previous axes
    svg.selectAll(".x-axis").remove();
    svg.selectAll(".y-axis").remove();


    // (re)Set up scales
    const xScale = d3.scaleLinear()
        .domain(d3.extent(overall_rankings_filtered_by_year, d => d.year))
        .range([50, ctx.timeline_w - 50]);

    const yScale = d3.scaleLinear()
        .domain(d3.extent(overall_rankings_filtered_by_year, d => 3600*d.avgSpeed))
        .range([ctx.timeline_h - 50, 50]);

    const colorScale = d3.scaleOrdinal(d3.schemeCategory10);

    // Create new axes
    const xAxis = d3.axisBottom(xScale).tickFormat(d3.format("d"));
    const yAxis = d3.axisLeft(yScale);


    svg.append("g")
        .attr("class", "x-axis")
        .attr("transform", `translate(0, ${ctx.timeline_h - 50})`)
        .call(xAxis)
        .selectAll("path, line")
        .attr("stroke", "white");

    svg.append("g")
        .attr("class", "y-axis")
        .attr("transform", "translate(50, 0)")
        .call(yAxis)
        .selectAll("path, line")
        .attr("stroke", "white");

    svg.selectAll(".tick text")
       .attr("fill", "white");
    
    // Create scatter plot

    svg.append("g").attr("id","points").selectAll("circle")
        .data(overall_rankings_filtered_by_year)
        .enter()
        .append("circle")
        .attr("cx", d => xScale(d.year))
        .attr("cy", d => yScale(3600*d.avgSpeed))
        .attr("r", 3)
        .attr("fill", d => d.nationality ? colorScale(d.nationality) : "black")


    // Add event listener for circle click
    svg.selectAll("circle").on("click", function(event, d) {
        console.log(d.name);
    });
}

function compareStringsInsensitive(str1, str2) {
    const normalizeAndClean = str => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    return normalizeAndClean(str1).toLowerCase() === normalizeAndClean(str2).toLowerCase();
  }

function exportToCSV(array, filename = "data.csv") {
    // Step 1: Convert the array to CSV format
    const csvContent = array.map(row => row.join(",")).join("\n");
  
    // Step 2: Create a Blob object
    const blob = new Blob([csvContent], { type: "text/csv" });
  
    // Step 3: Create a temporary download link
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
  
    // Step 4: Trigger the download
    document.body.appendChild(link); // Append to the DOM (required for Firefox)
    link.click();
    document.body.removeChild(link); // Clean up
}


// Sliders

document.addEventListener('DOMContentLoaded', () => {
    const lowerSlider = d3.select('#lower');
    const upperSlider = d3.select('#upper');
    const lowerValSpan = d3.select('#lower-val');
    const upperValSpan = d3.select('#upper-val');
    const minGap = 0.99;

    function updateSlidersLow(){
        let lowerVal = +lowerSlider.property('value');
        let upperVal = +upperSlider.property('value');
        let upperMax = +upperSlider.property('max');

        if (upperVal < lowerVal + minGap) {
            if (lowerVal + minGap >= upperMax) {
                upperSlider.property('value', upperMax);
                upperVal = upperMax;
                lowerSlider.property('value', upperMax - minGap);
                lowerVal = upperMax;
            } else if (lowerVal + minGap < upperMax) {
                upperSlider.property('value', lowerVal + minGap);
                upperVal = lowerVal + minGap;
            }
        }

        lowerValSpan.text(parseInt(lowerVal));
        upperValSpan.text(parseInt(upperVal));
        updateGraph();
        overviewCitiesGraph();
    };

    function updateSlidersHigh(){
        let lowerVal = +lowerSlider.property('value');
        let upperVal = +upperSlider.property('value');
        let lowerMin = +lowerSlider.property('min');

        if (lowerVal > upperVal - minGap) {
            if (upperVal - minGap <= lowerMin) {
                lowerSlider.property('value', lowerMin);
                lowerVal = lowerMin;
                upperSlider.property('value', lowerMin + minGap);
                upperVal = lowerMin;
            } else if (upperVal - minGap > lowerMin) {
                lowerSlider.property('value', upperVal - minGap);
                lowerVal = upperVal - minGap;
            }
        }

        lowerValSpan.text(parseInt(lowerVal));
        upperValSpan.text(parseInt(upperVal));
        updateGraph();
        overviewCitiesGraph();
    };

    // Attacher les événements
    lowerSlider.on('input', updateSlidersLow);
    upperSlider.on('input', updateSlidersHigh);
});

function checkForUpdates(){
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
        }else{
            ctx.city_selected=null;
            console.log("unselected");
        }
        drawCities();
    });



}

function getSliderValues() {
    const lowerVal = +d3.select('#lower').property('value');
    const upperVal = +d3.select('#upper').property('value');
    return { lowerVal, upperVal };
}
