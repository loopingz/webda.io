import { useState } from "react";
import Paper from '@material-ui/core/Paper';
import Tabs from '@material-ui/core/Tabs';
import Tab from '@material-ui/core/Tab';
import { TabPanel, a11yProps } from '../App';
import { JsonEditor as Editor } from 'jsoneditor-react';
import 'jsoneditor-react/es/editor.min.css';
import Ajv from 'ajv';
import { makeStyles } from '@material-ui/core/styles';
import { styles } from "../../styles/Styles";

const ajv = new Ajv({ allErrors: true, verbose: true });
const useStyles = makeStyles(styles);

const ServicePanel = ({ service, name }) => {
    const classes = useStyles();
    const [value, setValue] = useState(1);
    const handleChange = (event, newValue) => {
        setValue(newValue);
    };
    const handleJSONChange = (newValue) => {
        console.log(newValue);
    }
    return (
        <Paper style={{ width: 'calc(100vw - 320px)', height: '100vh' }}>
            <Tabs
                value={value}
                onChange={handleChange}
                indicatorColor="primary"
                centered
                className={classes.serviceContentTab}
            >
                <Tab label="Form JSON Schema" {...a11yProps(0)} />
                <Tab label="Raw Editor" {...a11yProps(1)} />
                <Tab label="Computed Parameters" {...a11yProps(2)} />
            </Tabs>
            <TabPanel value={value} index={0}>
                <div>
                    <p style={{ textAlign: 'center', textTransform: 'uppercase' }}>SERVICE NAME: {name}</p>
                    <p>{JSON.stringify(service)}</p>
                </div>
            </TabPanel>
            <TabPanel value={value} index={1}>
                <div>
                    <p style={{ textAlign: 'center', textTransform: 'uppercase' }}>SERVICE NAME: {name}</p>
                    <Editor
                        value={service}
                        onChange={handleJSONChange}
                        ajv={ajv}
                        schema={{}}
                    />
                </div>
            </TabPanel>
            <TabPanel value={value} index={2}>
                <div>
                    <p style={{ textAlign: 'center', textTransform: 'uppercase' }}>SERVICE NAME: {name}</p>
                    <p>{JSON.stringify(service)}</p>
                </div>
            </TabPanel>
        </Paper>
    )
}

export default ServicePanel;