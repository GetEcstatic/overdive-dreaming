## Immediate action

Note: the app is now deployed on vercel and I have a small number of beta testers logging in to the app. Any changes need to be non-destructive. I don't want users to lose data they have logged.

I want to start developing the analytics page. 

Page title: Analytics

Metrics should be filtered overall by time period (drop down menu) and user should be able to select time periods for:
- Last month
- Last 6 months
- Last year
- All time (starting with first recorded session date)

I'd like stats cards to display key stats as follows:

**Pool Sessions card** - showing:
- Total number of pool sessions (all disciplines)
- A breakdown of the number of pool sessions by discipline (STA, DYN, DYNB, DNF)

These stats should display for a selected year (dropdown menu) and default to current year

**Competition Card** - showing
- Number of tagged competition dives 
- Number of records (only display those that have tags)
- A breakdown of the records by discipline (STA, DYN, DYNB, DNF)
These stats should display for a selected year (dropdown menu) and default to current year

**Progress over time**  - this is a chart that includes:
- Dropdown to select discipline to view
- X-Axis = time period as per selected time period
- Y-axis - distance in m (DYN/DYNB/DNF) or time in mm:ss (STA)

**Personal bests Card** - current card works

**Training summary Card** - including:
- Total sessions for the timeframe
- Avg session/week
- Avg RPE
- Avg Joy




## Ideas for addtional variables

**These are just ideas, please do not act on them for now, however feel free to comment on the ideas** 
- Equipment groups - low priority. Not sure it would work actually.


## Ideas of monetisation
**Also just ideas. Please do not act on these for now**
- Possible corporate sponsorship oops 


## Additional Suggestions to refine

**Please do not act upon these suggestions for now. They need more thought**
- Fewer fields are better: e.g. anywhere duration or time is indicated better to autopopulate the : between mm:ss

- Dive watch data capture - .csv file including metrics for:
	- heartrate
	- depth
	- time
	- lap time
	- interval time
	- temperature

- Crop editor for uploaded photos

- Change emoji colours to suit the theme - the yellows are not nice as they don't match.


