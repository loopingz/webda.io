import { useState } from "react";
import { makeStyles } from '@material-ui/core/styles';
import { styles } from "../styles/Styles";
import Tabs from '@material-ui/core/Tabs';
import Tab from '@material-ui/core/Tab';
import ServicesPanel from './tabPanels/ServicesPanel';
import APIPanel from './tabPanels/APIPanel';
import DeploymentPanel from './tabPanels/DeploymentPanel';
import ConfigurationPanel from './tabPanels/ConfigurationPanel';
import { useSelector } from "react-redux";

const useStyles = makeStyles(styles);

export const TabPanel = ({ children, value, index }) => {
    return (
        <div
            role="tabpanel"
            hidden={value !== index}
            id={`vertical-tabpanel-${index}`}
            aria-labelledby={`vertical-tab-${index}`}
        >
            {value === index && (
                { ...children }
            )}
        </div>
    );
}

export const a11yProps = (index) => {
    return {
        id: `vertical-tab-${index}`,
        'aria-controls': `vertical-tabpanel-${index}`
    };
}

const MainTab = () => {
    const classes = useStyles();
    const [value, setValue] = useState(0);
    const services = useSelector(state => state.configuration);
    const handleChange = (event, newValue) => {
        setValue(newValue);
    };
    return (
        <div className={classes.root}>
            <Tabs
                orientation="vertical"
                value={value}
                onChange={handleChange}
                indicatorColor='#3883fa'
                className={classes.tabs}
                centered
            >
                <Tab wrapped label="Services" {...a11yProps(0)} />
                <Tab wrapped label="API" {...a11yProps(1)} />
                <Tab wrapped label="Deployment" {...a11yProps(2)} />
                <Tab wrapped label="Configuration" {...a11yProps(3)} />
            </Tabs>
            <TabPanel value={value} index={0}>
                <ServicesPanel services={services} />
            </TabPanel>
            <TabPanel value={value} index={1}>
                <APIPanel />
            </TabPanel>
            <TabPanel value={value} index={2}>
                <DeploymentPanel />
            </TabPanel>
            <TabPanel value={value} index={3}>
                <ConfigurationPanel />
            </TabPanel>
        </div>
    )
}

export default MainTab;