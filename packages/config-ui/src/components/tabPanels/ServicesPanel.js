import { useState } from "react";
import Tabs from '@material-ui/core/Tabs';
import { makeStyles } from '@material-ui/core/styles';
import { styles } from "../../styles/Styles";
import Tab from '@material-ui/core/Tab';
import ServicePanel from './ServicePanel';
import Box from '@material-ui/core/Box';

export function TabPanel(props) {
    const { children, value, index, ...other } = props;
    return (
        <div
            role="tabpanel"
            hidden={value !== index}
            id={`vertical-tabpanel-${index}`}
            aria-labelledby={`vertical-tab-${index}`}
            {...other}
        >
            {value === index && (
                <Box p={3}>
                    <div>{children}</div>
                </Box>
            )}
        </div>
    );
}

export function a11yProps(index) {
    return {
        id: `vertical-tab-${index}`,
        'aria-controls': `vertical-tabpanel-${index}`,
    };
}

const useStyles = makeStyles(styles);

const ServicesPanel = ({ services }) => {
    const classes = useStyles();
    const [servicePanelValue, setServicePanelValue] = useState(0);
    const handleChange = (event, newValue) => {
        setServicePanelValue(newValue);
    };
    return (
        <div className={classes.root}>
            <Tabs
                value={servicePanelValue}
                onChange={handleChange}
                orientation="vertical"
                className={classes.tabs}
                indicatorColor='primary'
            >
                {services && Object.keys(services).map((service, i) => {
                    return (
                        <Tab key={i} label={service} {...a11yProps(i)} />
                    )
                })}
            </Tabs>
            {services && Object.keys(services).map((service, i) => {
                return (
                    <TabPanel key={i} value={servicePanelValue} index={i}>
                        <ServicePanel service={services[service]} name={service} />
                    </TabPanel>
                )
            })}
        </div >
    );
}

export default ServicesPanel;