import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SB_URL, process.env.SB_KEY);

async function findHouses() {
    const { data, error } = await supabase
        .from('households')
        .select('id, handle, app_state(config)');

    if (error) {
        console.error(error);
        return;
    }

    console.log('--- HOUSEHOLD INVESTIGATION ---');
    data.forEach(h => {
        const names = h.app_state?.config?.names || {};
        const nameList = Object.values(names).join(', ');
        console.log(`Handle: ${h.handle} | Members: [${nameList}]`);
    });
}

findHouses();
