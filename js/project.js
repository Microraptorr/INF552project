const ctx = {
    w: 1200,
    h: 1400,
    carte_w: 700,
    carte_h: 800,
    timeline_w: 600,
    timeline_h: 600,
    selected_cyclist: null,
};


function createViz() {
    console.log("Using D3 v" + d3.version);
    let mainG = d3.select("#main");
    mainG.append("div").attr("id", "map");
    mainG.append("div").attr("id", "timelineG");
    loadData();
};

function loadData() {
    Promise.all([
        d3.csv("TDF_data/stages_general.csv"),
        d3.csv("TDF_data/cities_with_coordinates.csv"),
        d3.csv("TDF_data/overall_rankings.csv"),
        d3.csv("TDF_data/teams_of_the_finishers.csv"),
        d3.csv("TDF_data/data_test.csv"),
        d3.csv("TDF_data/number_starters_finishers.csv")
    ]).then(function (data) {
        generateMap(data);
        overviewFinishersGraph(data);
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
            (stage.Origin === city.City || stage.Destination === city.City)
            || city.City === ctx.city_selected.City
            )
        );
    }else{
        ctx.linked_cities = ctx.linked_cities.filter((d)=>(d.occurrence_nb>=10));
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
  
    const cellSize_h = 8;
    const cellSize_w = ctx.carte_w/(upperVal-lowerVal+1);

    const margin = { top: 50, right: 20, bottom: 50, left: 150 }; // Increased left margin for city labels
  
    // Check if the SVG already exists
    let svg_2 = d3.select("#citiesTimeline")
    .attr("width",ctx.map_w)
    .attr("height",ctx.map_h);
  
    if (svg_2.empty()) {
      // If it doesn't exist, create it
      svg_2 = d3.select("#timelineG")
        .append("svg")
        .attr("id", "citiesTimeline")
        .attr("width", years.length * cellSize_w + margin.left + margin.right)
        .attr("height", ctx.linked_cities.length * cellSize_h + margin.top + margin.bottom);
    }
  
    // Clear previous content
    svg_2.selectAll("*").remove();
  
    // Create a color scale for visited vs. not visited
    const colorScale = d3.scaleOrdinal()
      .domain([0, 1]) // 0: Not visited, 1: Visited
      .range(["#333", "#FF4500"]); // Gray for not visited, orange for visited

      
    // Sort cities by descending latitude (.lat)
    const sortedCities = ctx.linked_cities.sort((a, b) => b.lat - a.lat); // Sort by descending lat
  
    // Draw the grid (heatmap cells)
    svg_2.append("g")
      .selectAll("rect")
      .data(sortedCities.flatMap((city, y) =>
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
      .attr("x", d => margin.left + d.x * cellSize_w - 1)
      .attr("y", d => margin.top + d.y * cellSize_h - 1)
      .attr("width", cellSize_w + 1)
      .attr("height", cellSize_h + 1)
      .attr("fill", d => colorScale(d.visited));
  
    // Create x-axis for the years (only every fifth year)
    const xScale = d3.scaleBand()
      .domain(years.filter(year => year % 5 === 0)) // Only include years divisible by 5
      .range([0, years.length * cellSize_w]);
  
    svg_2.append("g")
      .attr("transform", `translate(${margin.left}, ${margin.top + ctx.linked_cities.length * cellSize_h})`) // Position the x-axis at the bottom
      .call(d3.axisBottom(xScale).tickFormat(d => d)) // Add the x-axis using the scale
      .selectAll("text")
      .style("font-size", "10px")
      .attr("transform", "rotate(-45)") // Rotate labels for better readability
      .style("fill", "white") // Set text color to white
      .style("text-anchor", "end");

  
    // Create y-axis for the cities
    const yScale = d3.scaleBand()
      .domain(sortedCities.map(city => city.City)) // Set the city names on the y-axis
      .range([0, sortedCities.length * cellSize_h]);
  
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
      .attr("y2", margin.top + sortedCities.length * cellSize_h)
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

    d3.select("#timelineG").append("svg")
      .attr("id", "distYear")
      .attr("width", ctx.timeline_w)
      .attr("height", ctx.timeline_h);

    ctx.startersFinishers = data[5];

    d3.select("#timelineG").append("svg")
      .attr("id", "propSF")
      .attr("width", ctx.timeline_w)
      .attr("height", ctx.timeline_h);

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
    svg.selectAll("x-axis-label").remove();
    svg.selectAll("y-axis-label").remove();


    // (re)Set up scales
    const xScale = d3.scaleLinear()
        .domain(d3.extent(overall_rankings_filtered_by_year, d => d.year))
        .range([50, ctx.timeline_w - 50]);

    const yScale = d3.scaleLinear()
        .domain(d3.extent(overall_rankings_filtered_by_year, d => 3600*d.avgSpeed))
        .range([ctx.timeline_h - 50, 50]);

    // Creating a fixed colorScale for the main participating countries
    const countryColors = ["#0055A4", "#FFD700", "#009246", "#000000", "#F2003C", "#D52B1E", "#C60B1E", "#00843D", "#FF781F", "#00247D", "#C60C30", "#3C3B6E", "#FCD116"];
    const colorScale = d3.scaleOrdinal()
                         .domain(["FRA", "BEL", "ITA", "GER", "LUX", "SUI", "ESP", "AUS", "NED", "GBR", "DEN", "USA", "COL"])
                         .range(countryColors)
                         .unknown("#666666");
    
    // Create new axes
    const xAxis = d3.axisBottom(xScale).tickFormat(d3.format("d"));
    const yAxis = d3.axisLeft(yScale);


    svg.append("g")
        .attr("class", "x-axis")
        .attr("transform", `translate(0, ${ctx.timeline_h - 50})`)
        .call(xAxis)
        .selectAll("path, line")
        .attr("stroke", "white");

    svg.append("text")
        .attr("class", "x-axis-label")
        .attr("x", ctx.timeline_w / 2)
        .attr("y", ctx.timeline_h - 10)
        .attr("text-anchor", "middle")
        .attr("fill", "white") 
        .text("Year");

    svg.append("g")
        .attr("class", "y-axis")
        .attr("transform", "translate(50, 0)")
        .call(yAxis)
        .selectAll("path, line")
        .attr("stroke", "white");

    svg.append("text")
        .attr("class", "y-axis-label")
        .attr("x", -ctx.timeline_h / 2)
        .attr("y", 15) 
        .attr("transform", "rotate(-90)")
        .attr("text-anchor", "middle") 
        .attr("fill", "white") 
        .text("Average speed (km/h)");

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
        if (ctx.selected_cyclist==null){
            d3.select("#main")
                .append("div")
                .attr("id", "selected-cyclist")
                .style("width", "800px")
                .style("position", "absolute")
                .style("top", "750px")    // Set the top position to 800px
                .style("left", "950px")   // Set the left position to 350px
                .style("padding", "5px")
                .style("font-size", "2em")  // Make the text twice bigger
                .style("color", "white")  // Set the text color to white
                .text("Cyclist : " + d.name);
            ctx.selected_cyclist = d;
        }else{
            d3.select("#selected-cyclist")
                .remove()
            ctx.selected_cyclist=null;
        }
    });


    // distance/year graph
    const years = d3.range(lowerVal, upperVal + 1);

    ctx.editions = years.map((year)=>{
        let line = ctx.overall_rankings.find((d) => d.year == year);
        let distance = line ? +line.distance : null;
        return { year, distance };
    })
    .filter((d) => d.distance !== null);

    ctx.startersFinishers_filtered = ctx.startersFinishers.filter(d => d.Year >= lowerVal && d.Year <= upperVal)

    let svg2 = d3.select("#distYear");
    // Remove previous points
    svg2.selectAll(".distance-line").remove();
    svg2.selectAll(".starters-line").remove();
    svg2.selectAll(".finishers-line").remove();
    svg2.selectAll(".areaSF").remove();
    // Remove previous axes
    svg2.selectAll(".x-axis-edition").remove();
    svg2.selectAll(".y-axis-dist").remove();
    svg2.selectAll(".y-axis-starters").remove();
    svg2.selectAll(".x-axis-label-edition").remove();
    svg2.selectAll(".y-axis-label-dist").remove();
    svg2.selectAll(".y-axis-label-starters").remove();

    // (re)Set up scales
    const xScaleEdition = d3.scaleLinear()
        .domain(d3.extent(ctx.editions, d => d.year))
        .range([50, ctx.timeline_w - 50]);

    const yScaleDist = d3.scaleLinear()
        .domain(d3.extent(ctx.editions, d => d.distance))
        .range([ctx.timeline_h - 50, 50]);

    const minPax = d3.min(ctx.startersFinishers_filtered, d => +d.Finishers);
    const maxPax = d3.max(ctx.startersFinishers_filtered, d => +d.Starters);

    const yScaleStarters = d3.scaleLinear()
        .domain([minPax, maxPax])
        .range([ctx.timeline_h - 50, 50]);
    
    // Create new axes
    const xAxisEdition = d3.axisBottom(xScaleEdition).tickFormat(d3.format("d"));
    const yAxisDist = d3.axisLeft(yScaleDist);
    const yAxisStarters = d3.axisRight(yScaleStarters);

    svg2.append("g")
        .attr("class", "x-axis-edition")
        .attr("transform", `translate(0, ${ctx.timeline_h - 50})`)
        .call(xAxisEdition)
        .selectAll("path, line")
        .attr("stroke", "white");

    svg2.append("text")
        .attr("class", "x-axis-label-edition")
        .attr("x", ctx.timeline_w / 2)
        .attr("y", ctx.timeline_h - 10)
        .attr("text-anchor", "middle")
        .attr("fill", "white") 
        .text("Year");

    svg2.append("g")
        .attr("class", "y-axis-dist")
        .attr("transform", "translate(50, 0)")
        .call(yAxisDist)
        .selectAll("path, line")
        .attr("stroke", "white");

    svg2.append("text")
        .attr("class", "y-axis-label-dist")
        .attr("x", -ctx.timeline_h / 2)
        .attr("y", 8) 
        .attr("transform", "rotate(-90)")
        .attr("text-anchor", "middle") 
        .attr("fill", "#FF4500") 
        .text("Distance (km)");

    svg2.append("g")
        .attr("class", "y-axis-starters")
        .attr("transform", `translate(${ctx.timeline_w-50}, 0)`)
        .call(yAxisStarters)
        .selectAll("path, line")
        .attr("stroke", "white");

    svg2.append("text")
        .attr("class", "y-axis-label-starters")
        .attr("x", -ctx.timeline_h / 2)
        .attr("y", ctx.timeline_w-10) 
        .attr("transform", "rotate(-90)")
        .attr("text-anchor", "middle") 
        .attr("fill", "green") 
        .text("Starters (top) - Finishers (bottom)");

    svg2.selectAll(".tick text")
       .attr("fill", "white");
    
    // trace the curves
    // Create the line generator for the starters
    const lineGeneratorStarters = d3.line()
        .x(d => xScaleEdition(d.Year))
        .y(d => yScaleStarters(+d.Starters));

    svg2.append("path")
        .datum(ctx.startersFinishers_filtered)
        .attr("class", "starters-line")
        .attr("d", lineGeneratorStarters)
        .attr("fill", "none")
        .attr("stroke", "green")
        .attr("stroke-width", 2);
    
    // Create the line generator for the finishers
    const lineGeneratorFinishers = d3.line()
        .x(d => xScaleEdition(d.Year))
        .y(d => yScaleStarters(+d.Finishers));

    svg2.append("path")
        .datum(ctx.startersFinishers_filtered)
        .attr("class", "finishers-line")
        .attr("d", lineGeneratorFinishers)
        .attr("fill", "none")
        .attr("stroke", "green")
        .attr("stroke-width", 2);

    const area = d3.area()
        .x(d => xScaleEdition(d.x))
        .y0(d => yScaleStarters(d.y1)) // Bottom curve (data2)
        .y1(d => yScaleStarters(d.y2)); // Top curve (data1)
    
    // Combine the data for the area generator
    const areaData = ctx.startersFinishers_filtered.map((d) => ({
        x: d.Year,
        y1: d.Finishers, // Bottom curve value
        y2: d.Starters,        // Top curve value
        }));

    svg2.append("path")
    .datum(areaData)
    .attr("class","areaSF")
    .attr("d", area)
    .attr("fill", "lightgreen") // Color between the curves
    .attr("opacity", 0.5);

    // Create the line generator
    const lineGenerator = d3.line()
        .x(d => xScaleEdition(d.year))
        .y(d => yScaleDist(d.distance));

    // Append the line path
    svg2.append("path")
        .datum(ctx.editions) // Bind the data
        .attr("class", "distance-line")
        .attr("d", lineGenerator) // Generate the line
        .attr("fill", "none")
        .attr("stroke", "#FF4500")
        .attr("stroke-width", 2);
    
    // graph showing the proportions SF
    ctx.proportions = years.map((year)=>{
        let line = ctx.startersFinishers.find((d) => d.Year == year);
        if (line && +line.Starters > 0 && +line.Finishers > 0) {
            let starter = +line.Starters;
            let finisher = +line.Finishers;
            let prop = 1- ((starter - finisher)/(starter + finisher));
            let top = 1;
            let bottom = 0;
            return { year, prop, top, bottom };
        }
        return null
    })
    .filter((d) => d !== null);

    let svg3 = d3.select("#propSF");

    // Remove previous points
    svg3.selectAll(".prop-line").remove();
    svg3.selectAll(".area-top").remove();
    svg3.selectAll(".area-bottom").remove();
    // Remove previous axes
    svg3.selectAll(".x-axis-prop").remove();
    svg3.selectAll(".y-axis-prop").remove();
    svg3.selectAll(".x-axis-label-prop").remove();
    svg3.selectAll(".y-axis-label-prop").remove();

    // (re)Set up scales
    const xScaleProp = d3.scaleLinear()
        .domain(d3.extent(ctx.proportions, d => d.year))
        .range([50, ctx.timeline_w - 50]);

    const yScaleProp = d3.scaleLinear()
        .domain([0, 1])
        .range([ctx.timeline_h - 50, 50]);
    
    // Create new axes
    const xAxisProp = d3.axisBottom(xScaleProp).tickFormat(d3.format("d"));
    const yAxisProp = d3.axisLeft(yScaleProp);

    svg3.append("g")
        .attr("class", "x-axis-prop")
        .attr("transform", `translate(0, ${ctx.timeline_h - 50})`)
        .call(xAxisProp)
        .selectAll("path, line")
        .attr("stroke", "white");

    svg3.append("text")
        .attr("class", "x-axis-label-prop")
        .attr("x", ctx.timeline_w / 2)
        .attr("y", ctx.timeline_h - 10)
        .attr("text-anchor", "middle")
        .attr("fill", "white") 
        .text("Year");

    svg3.append("g")
        .attr("class", "y-axis-prop")
        .attr("transform", "translate(50, 0)")
        .call(yAxisProp)
        .selectAll("path, line")
        .attr("stroke", "white");

    svg3.append("text")
        .attr("class", "y-axis-label-prop")
        .attr("x", -ctx.timeline_h / 2)
        .attr("y", 8) 
        .attr("transform", "rotate(-90)")
        .attr("text-anchor", "middle") 
        .attr("fill", "white") 
        .text("Proportion Starters/Finishers");

    svg3.selectAll(".tick text")
       .attr("fill", "white");

    // Define the area for the top part (above the baseline)
    const areaAbove = d3.area()
    .x(d => xScaleProp(d.x))
    .y0(d => yScaleProp(d.y1)) // Baseline
    .y1(d => yScaleProp(d.y2)); // Top of the curve (clipped at the baseline)
    
    // Combine the data for the area generator
    const areaDataAbove = ctx.proportions.map((d) => ({
        x: d.year,
        y1: d.prop, // Bottom curve value
        y2: d.top,        // Top curve value
        }));

    svg3.append("path")
    .datum(areaDataAbove)
    .attr("class","area-top")
    .attr("d", areaAbove)
    .attr("fill", "lightblue") // Color between the curves
    .attr("opacity", 0.5);

    // Define the area for the bottom part
    const areaUnder = d3.area()
    .x(d => xScaleProp(d.x))
    .y0(d => yScaleProp(d.y1)) // bottom of the curve
    .y1(d => yScaleProp(d.y2)); // curve
    
    // Combine the data for the area generator
    const areaDataUnder = ctx.proportions.map((d) => ({
        x: d.year,
        y1: d.bottom, // Bottom curve value
        y2: d.prop,        // Top curve value
        }));

    svg3.append("path")
    .datum(areaDataUnder)
    .attr("class","area-bottom")
    .attr("d", areaUnder)
    .attr("fill", "red") // Color between the curves
    .attr("opacity", 0.5);

    // trace the curves
    // Create the line generator for the starters
    const lineGeneratorProp = d3.line()
        .x(d => xScaleProp(d.year))
        .y(d => yScaleProp(d.prop));

    svg3.append("path")
        .datum(ctx.proportions)
        .attr("class", "prop-line")
        .attr("d", lineGeneratorProp)
        .attr("fill", "none")
        .attr("stroke", "white")
        .attr("stroke-width", 0.5);


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
            d3.select("#main")
            .append("div")
            .attr("id", "selected-city")
            .style("position", "absolute")
            .style("top", "750px")    // Set the top position to 800px
            .style("left", "300px")   // Set the left position to 350px
            .style("padding", "5px")
            .style("color", "white")  // Set the text color to white
            .style("font-size", "2em")  // Make the text twice bigger
            .text("City selected : "+ctx.city_selected.City);

        }else{
            ctx.city_selected=null;
            d3.select("#selected-city")
            .remove()
        }
        drawCities();
    });



}

function getSliderValues() {
    const lowerVal = +d3.select('#lower').property('value');
    const upperVal = +d3.select('#upper').property('value');
    return { lowerVal, upperVal };
}
