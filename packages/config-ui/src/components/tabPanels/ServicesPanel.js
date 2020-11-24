import { useState } from "react";
import Tabs from '@material-ui/core/Tabs';
import { makeStyles } from '@material-ui/core/styles';
import { styles } from "../../styles/Styles";
import Tab from '@material-ui/core/Tab';
import { TabPanel, a11yProps } from '../App';
import ServicePanel from './ServicePanel';

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
                indicatorColor='#3883fa'
            >
                {Object.keys(services).map((service, i) => {
                    return (
                        <Tab key={i} label={service} {...a11yProps(i)} />
                    )
                })}
            </Tabs>
            {Object.keys(services).map((service, i) => {
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